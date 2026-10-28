import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient, Rol } from "@prisma/client";

const prisma = new PrismaClient();

interface JwtPayload {
  userId: string;
  tenantId: string;
  iat: number; // segundos; lo agrega jwt.sign
}

// El segundo actual, como Date. passwordCambiadaEn se guarda así y el token nuevo se firma
// con ese mismo segundo como `iat`: el token de la sesión que cambió la contraseña no queda
// como "anterior al cambio".
export function segundoActual(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

export function firmarToken(userId: string, tenantId: string, emitidoEn = segundoActual()): string {
  return jwt.sign(
    { userId, tenantId, iat: emitidoEn.getTime() / 1000 },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" },
  );
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
      rol?: Rol;
    }
  }
}

export async function verificarToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as JwtPayload;
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  // La firma solo prueba que el token lo emitimos nosotros, no que el usuario y su
  // negocio sigan existiendo (por ejemplo, después de re-sembrar la BD) ni que siga activo.
  // El rol también se lee aquí y no del token: si cambia, cuenta desde la siguiente petición.
  const user = await prisma.user.findFirst({
    where: { id: payload.userId, tenantId: payload.tenantId },
    select: { rol: true, activo: true, passwordCambiadaEn: true },
  });

  if (!user) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  if (!user.activo) {
    return res.status(401).json({ error: "Tu usuario está desactivado" });
  }

  // Token emitido antes del último cambio de contraseña: esa sesión ya no vale. Todo en
  // segundos; un token del mismo segundo que el cambio sigue valiendo (es el nuevo).
  if (user.passwordCambiadaEn && payload.iat < user.passwordCambiadaEn.getTime() / 1000) {
    return res.status(401).json({ error: "Tu contraseña cambió. Vuelve a iniciar sesión." });
  }

  req.userId = payload.userId;
  req.tenantId = payload.tenantId;
  req.rol = user.rol;
  next();
}

// Va después de verificarToken, en las rutas que el empleado no puede usar.
// Tipado como `validar`, para que la ruta siga viendo `req.params.id` como string.
export const soloDueno: RequestHandler<Record<string, string>> = (req, res, next) => {
  if (req.rol !== "DUENO") {
    return res.status(403).json({ error: "No tienes permiso para esta acción" });
  }
  next();
};
