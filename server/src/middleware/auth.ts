import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface JwtPayload {
  userId: string;
  tenantId: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tenantId?: string;
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
  // negocio sigan existiendo (por ejemplo, después de re-sembrar la BD).
  const user = await prisma.user.findFirst({
    where: { id: payload.userId, tenantId: payload.tenantId },
    select: { id: true },
  });

  if (!user) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  req.userId = payload.userId;
  req.tenantId = payload.tenantId;
  next();
}
