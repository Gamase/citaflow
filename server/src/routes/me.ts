import { Router, RequestHandler, Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { ClienteTenant } from "../db";
import { firmarToken, segundoActual, verificarToken } from "../middleware/auth";
import { limiteContrasena } from "../middleware/limites";
import { validar } from "../middleware/validar";
import { miCuentaSchema, miPasswordSchema, MiCuentaInput, MiPasswordInput } from "../schemas";

// Ajustes de la cuenta de quien hace la petición (dueño o empleado): siempre sobre sí mismo.
const router = Router();

router.use(verificarToken);

const MI_CUENTA = {
  nombre: true,
  email: true,
  rol: true,
  tenant: { select: { id: true, nombre: true } },
} satisfies Prisma.UserSelect;

async function yo(db: ClienteTenant, userId: string, tenantId: string) {
  return db.user.findFirst({ where: { id: userId, tenantId } });
}

// Revisa la contraseña actual. Si no coincide responde 400 (no 401: el front trata un 401
// como sesión vencida) y lo marca para que limiteContrasena cuente el intento.
async function passwordActualValida(actual: string, hash: string, res: Response): Promise<boolean> {
  if (await bcrypt.compare(actual, hash)) return true;
  res.locals.passwordIncorrecta = true;
  res.status(400).json({ error: "La contraseña actual no es correcta" });
  return false;
}

router.get("/", async (req, res) => {
  const user = await req.db.user.findFirst({
    where: { id: req.userId as string, tenantId: req.tenantId as string },
    select: MI_CUENTA,
  });
  if (!user) {
    return res.status(404).json({ error: "No encontrado" });
  }
  res.json(user);
});

// Solo cambiar el email pide contraseña, y solo entonces aplica el límite de intentos.
const limiteSiCambiaEmail: RequestHandler<Record<string, string>> = (req, res, next) =>
  (req.body as MiCuentaInput).email === undefined ? next() : limiteContrasena(req, res, next);

router.patch("/", validar(miCuentaSchema), limiteSiCambiaEmail, async (req, res) => {
  const { nombre, email, passwordActual } = req.body as MiCuentaInput;
  const user = await yo(req.db, req.userId as string, req.tenantId as string);
  if (!user) {
    return res.status(404).json({ error: "No encontrado" });
  }

  if (email !== undefined && !(await passwordActualValida(passwordActual as string, user.password, res))) {
    return;
  }

  try {
    const actualizado = await req.db.user.update({
      where: { id: user.id, tenantId: user.tenantId },
      data: { nombre, email },
      select: MI_CUENTA,
    });
    res.json(actualizado);
  } catch (err) {
    // El email es único en todo CitaFlow (con él se hace login), no solo en el negocio.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }
    throw err;
  }
});

// Cambia la contraseña y cierra las otras sesiones: verificarToken rechaza los tokens
// emitidos antes de passwordCambiadaEn. Esta sesión sigue con el token nuevo que se regresa.
router.patch("/password", validar(miPasswordSchema), limiteContrasena, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body as MiPasswordInput;
  const user = await yo(req.db, req.userId as string, req.tenantId as string);
  if (!user) {
    return res.status(404).json({ error: "No encontrado" });
  }

  if (!(await passwordActualValida(passwordActual, user.password, res))) {
    return;
  }

  // El mismo segundo para la marca y para el `iat` del token nuevo.
  const ahora = segundoActual();
  await req.db.user.update({
    where: { id: user.id, tenantId: user.tenantId },
    data: { password: await bcrypt.hash(passwordNueva, 10), passwordCambiadaEn: ahora },
  });

  res.json({ token: firmarToken(user.id, user.tenantId, ahora) });
});

export default router;
