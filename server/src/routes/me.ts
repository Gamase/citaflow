import { Router, RequestHandler, Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { ClienteTenant } from "../db";
import { firmarToken, segundoActual, verificarToken } from "../middleware/auth";
import { limiteContrasena, limiteReenvio } from "../middleware/limites";
import { validar } from "../middleware/validar";
import { miCuentaSchema, miPasswordSchema, MiCuentaInput, MiPasswordInput } from "../schemas";
import { mandarVerificacion } from "../tokensCorreo";

// Ajustes de la cuenta de quien hace la petición (dueño o empleado): siempre sobre sí mismo.
const router = Router();

router.use(verificarToken);

const MI_CUENTA = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  emailVerificado: true,
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

// tienePassword: si entra solo con Google, Ajustes ofrece "Crear contraseña". El hash nunca sale.
router.get("/", async (req, res) => {
  const user = await req.db.user.findFirst({
    where: { id: req.userId as string, tenantId: req.tenantId as string },
    select: { ...MI_CUENTA, password: true },
  });
  if (!user) {
    return res.status(404).json({ error: "No encontrado" });
  }
  const { password, ...cuenta } = user;
  res.json({ ...cuenta, tienePassword: password !== null });
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

  // Cambiar el email exige tener verificado el actual: si no, una cuenta mal escrita o
  // ajena podría "mudarse" a otro correo sin haber probado nunca que es suya.
  if (email !== undefined && !user.emailVerificado) {
    return res.status(403).json({ error: "Verifica tu correo actual antes de cambiarlo. Revisa tu bandeja o pide otro enlace." });
  }

  // Cambiar el email pide la contraseña actual; quien entra solo con Google primero crea una.
  if (email !== undefined && user.password === null) {
    return res.status(400).json({ error: "Crea una contraseña antes de cambiar tu email." });
  }

  if (email !== undefined && !(await passwordActualValida(passwordActual as string, user.password as string, res))) {
    return;
  }

  // Un email distinto vuelve a quedar sin verificar, y se le manda la verificación.
  const cambiaEmail = email !== undefined && email !== user.email;

  try {
    const actualizado = await req.db.user.update({
      where: { id: user.id, tenantId: user.tenantId },
      data: { nombre, email, ...(cambiaEmail && { emailVerificado: null }) },
      select: MI_CUENTA,
    });
    if (cambiaEmail) {
      try {
        await mandarVerificacion(actualizado);
      } catch (err) {
        console.error("No se pudo preparar el correo de verificación:", err instanceof Error ? err.message : err);
      }
    }
    res.json({ ...actualizado, tienePassword: user.password !== null });
  } catch (err) {
    // El email es único en todo CitaFlow (con él se hace login), no solo en el negocio.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }
    throw err;
  }
});

// Reenviar el correo de verificación (el aviso de arriba del panel tiene el botón).
router.post("/reenviar-verificacion", limiteReenvio, async (req, res) => {
  const user = await yo(req.db, req.userId as string, req.tenantId as string);
  if (!user) {
    return res.status(404).json({ error: "No encontrado" });
  }
  if (user.emailVerificado) {
    return res.status(400).json({ error: "Tu correo ya está verificado." });
  }
  await mandarVerificacion(user);
  res.json({ mensaje: `Te mandamos un correo a ${user.email}. Revisa también la carpeta de spam.` });
});

// Cambia la contraseña y cierra las otras sesiones: verificarToken rechaza los tokens
// emitidos antes de passwordCambiadaEn. Esta sesión sigue con el token nuevo que se regresa.
// Si aún no tiene (entra solo con Google), la crea sin pedir la actual.
router.patch("/password", validar(miPasswordSchema), limiteContrasena, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body as MiPasswordInput;
  const user = await yo(req.db, req.userId as string, req.tenantId as string);
  if (!user) {
    return res.status(404).json({ error: "No encontrado" });
  }

  if (user.password !== null) {
    if (passwordActual === undefined) {
      return res.status(400).json({ error: "Escribe tu contraseña actual" });
    }
    if (!(await passwordActualValida(passwordActual, user.password, res))) {
      return;
    }
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
