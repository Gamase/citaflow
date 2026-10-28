import { Router, RequestHandler, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { firmarToken, segundoActual } from "../middleware/auth";
import { Prisma } from "@prisma/client";
import { validar } from "../middleware/validar";
import { limiteGoogle, limiteLogin, limiteOlvideCorreo, limiteOlvideIp, limiteRegistro } from "../middleware/limites";
import {
  googleRegistroSchema,
  googleSchema,
  loginSchema,
  olvideSchema,
  registroSchema,
  restablecerSchema,
  verificarCorreoSchema,
  GoogleInput,
  GoogleRegistroInput,
  LoginInput,
  OlvideInput,
  RegistroInput,
  RestablecerInput,
  VerificarCorreoInput,
} from "../schemas";
import { consumirToken, mandarRestablecer, mandarVerificacion } from "../tokensCorreo";
import { verificarCredencialGoogle, PerfilGoogle } from "../google";

const ENLACE_INVALIDO = "El enlace no es válido o ya venció. Pide uno nuevo.";

const router = Router();

router.post("/register", limiteRegistro, validar(registroSchema), async (req, res) => {
  const { nombreNegocio, email, password, nombreUsuario } = req.body as RegistroInput;

  const hashedPassword = await bcrypt.hash(password, 10);

  let tenant;
  try {
    tenant = await prisma.tenant.create({
      data: {
        nombre: nombreNegocio,
        users: {
          create: {
            email,
            password: hashedPassword,
            nombre: nombreUsuario,
            rol: "DUENO",
          },
        },
      },
      include: { users: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }
    throw err;
  }

  const user = tenant.users[0];

  if (!user) {
    return res.status(500).json({ error: "No se pudo crear el usuario" });
  }

  // Entra sin verificar: puede usar la app y verá un aviso. Si el correo falla, el registro
  // sigue siendo válido (el aviso deja reenviarlo). mandarVerificacion no lanza por el envío.
  try {
    await mandarVerificacion(user);
  } catch (err) {
    console.error("No se pudo preparar el correo de verificación:", err instanceof Error ? err.message : err);
  }

  const token = firmarToken(user.id, tenant.id);

  res.status(201).json({
    token,
    tenant: { id: tenant.id, nombre: tenant.nombre },
    user: { nombre: user.nombre, email: user.email, rol: user.rol, verificado: false },
  });
});

router.post("/login", limiteLogin, validar(loginSchema), async (req, res) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: { select: { id: true, nombre: true } } },
  });

  // Sin contraseña (entra solo con Google): la misma respuesta que una contraseña incorrecta.
  if (!user || user.password === null) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const passwordValida = await bcrypt.compare(password, user.password);

  if (!passwordValida) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  // Después de revisar la contraseña: así no se puede averiguar qué correos existen.
  if (!user.activo) {
    return res.status(403).json({ error: "Tu usuario está desactivado. Habla con el dueño del negocio." });
  }

  const token = firmarToken(user.id, user.tenantId);

  res.json({
    token,
    tenant: user.tenant,
    user: { nombre: user.nombre, email: user.email, rol: user.rol, verificado: user.emailVerificado !== null },
  });
});

// --- Login con Google ---

// Sin GOOGLE_CLIENT_ID el server arranca igual y estas rutas responden 503 (existen, pero
// no están disponibles en este entorno); el front tampoco muestra el botón.
const googleConfigurado: RequestHandler = (_req, res, next) => {
  if (process.env.GOOGLE_CLIENT_ID) return next();
  res.status(503).json({ error: "El inicio de sesión con Google no está configurado." });
};

// Verifica la credencial; si no sirve responde un 401 genérico (el motivo queda en el log).
async function perfilDeGoogle(credential: string, res: Response): Promise<PerfilGoogle | null> {
  const perfil = await verificarCredencialGoogle(credential, process.env.GOOGLE_CLIENT_ID as string);
  if (!perfil) {
    res.status(401).json({ error: "No se pudo iniciar sesión con Google. Intenta de nuevo." });
  }
  return perfil;
}

// Entrar con Google. Con cuenta: entra (y la primera vez se vincula). Sin cuenta: no se crea
// nada; el front pide el nombre del negocio y llama a /google/registro.
router.post("/google", limiteGoogle, validar(googleSchema), googleConfigurado, async (req, res) => {
  const perfil = await perfilDeGoogle((req.body as GoogleInput).credential, res);
  if (!perfil) return;

  // Primero por la cuenta de Google ya vinculada (sigue entrando aunque haya cambiado su
  // email en CitaFlow); si no, por el email, sin importar mayúsculas.
  const conTenant = { tenant: { select: { id: true, nombre: true } } };
  const user =
    (await prisma.user.findUnique({ where: { googleId: perfil.sub }, include: conTenant })) ??
    (await prisma.user.findFirst({
      where: { email: { equals: perfil.email, mode: "insensitive" } },
      include: conTenant,
    }));

  if (!user) {
    return res.json({ necesitaRegistro: true, nombre: perfil.nombre, email: perfil.email });
  }
  if (!user.activo) {
    return res.status(403).json({ error: "Tu usuario está desactivado. Habla con el dueño del negocio." });
  }
  if (user.googleId !== null && user.googleId !== perfil.sub) {
    return res.status(409).json({ error: "Tu cuenta de CitaFlow ya está vinculada a otra cuenta de Google." });
  }

  const ahora = segundoActual();
  let verificado = user.emailVerificado !== null;
  if (user.googleId === null) {
    // Primera vez con Google: se vincula, y Google ya probó que el correo es suyo.
    // Si la cuenta NO estaba verificada, su contraseña la puso alguien que nunca probó tener
    // ese correo (pudo registrarlo otra persona antes que el dueño real: "pre-account
    // takeover"). Esa contraseña se borra y se cierran sus sesiones; si quiere contraseña,
    // la crea en Ajustes.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: perfil.sub,
        emailVerificado: user.emailVerificado ?? new Date(),
        ...(!verificado && { password: null, passwordCambiadaEn: ahora }),
      },
    });
    verificado = true;
  }

  res.json({
    token: firmarToken(user.id, user.tenantId, ahora),
    tenant: user.tenant,
    user: { nombre: user.nombre, email: user.email, rol: user.rol, verificado },
  });
});

// Crear negocio con Google: como /register, pero sin contraseña y con el correo ya verificado.
router.post("/google/registro", limiteRegistro, validar(googleRegistroSchema), googleConfigurado, async (req, res) => {
  const { credential, nombreNegocio } = req.body as GoogleRegistroInput;
  const perfil = await perfilDeGoogle(credential, res);
  if (!perfil) return;

  // Si mientras ponía el nombre del negocio alguien se registró con ese correo, que entre
  // por /google (que vincula) en lugar de crear otra cuenta.
  const yaExiste = await prisma.user.findFirst({
    where: { OR: [{ googleId: perfil.sub }, { email: { equals: perfil.email, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (yaExiste) {
    return res.status(409).json({ error: "Ya hay una cuenta con ese correo. Inicia sesión con Google." });
  }

  let tenant;
  try {
    tenant = await prisma.tenant.create({
      data: {
        nombre: nombreNegocio,
        users: {
          create: {
            email: perfil.email,
            nombre: perfil.nombre,
            rol: "DUENO",
            googleId: perfil.sub,
            emailVerificado: new Date(),
          },
        },
      },
      include: { users: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya hay una cuenta con ese correo. Inicia sesión con Google." });
    }
    throw err;
  }

  const user = tenant.users[0];
  if (!user) {
    return res.status(500).json({ error: "No se pudo crear el usuario" });
  }

  res.status(201).json({
    token: firmarToken(user.id, tenant.id),
    tenant: { id: tenant.id, nombre: tenant.nombre },
    user: { nombre: user.nombre, email: user.email, rol: user.rol, verificado: true },
  });
});

// Abrir el enlace del correo de verificación (sin sesión: puede abrirse en otro dispositivo).
router.post("/verificar", validar(verificarCorreoSchema), async (req, res) => {
  const { token } = req.body as VerificarCorreoInput;
  const datos = await consumirToken(token, "VERIFICACION");
  if (!datos) {
    return res.status(400).json({ error: ENLACE_INVALIDO });
  }

  // Si cambió su email después de pedir el enlace, ese enlace ya no verifica nada.
  const user = await prisma.user.findUnique({ where: { id: datos.userId } });
  if (!user || user.email !== datos.email) {
    return res.status(400).json({ error: ENLACE_INVALIDO });
  }

  if (!user.emailVerificado) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerificado: new Date() } });
  }
  res.json({ mensaje: "Tu correo quedó verificado." });
});

// "Olvidé mi contraseña": SIEMPRE la misma respuesta, exista o no la cuenta, y se responde
// ANTES de buscarla o mandar el correo (si se esperara, el tiempo de respuesta delataría
// qué correos tienen cuenta). El trabajo de después va en try/catch: nada queda sin manejar.
router.post("/olvide", limiteOlvideIp, validar(olvideSchema), limiteOlvideCorreo, (req, res) => {
  const { email } = req.body as OlvideInput;
  res.json({ mensaje: "Si ese correo tiene una cuenta en CitaFlow, te mandamos un enlace para restablecer tu contraseña." });
  void procesarOlvide(email);
});

async function procesarOlvide(email: string) {
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    // Sin cuenta o desactivado: no se manda nada (y la respuesta ya fue la misma).
    if (!user || !user.activo) return;
    await mandarRestablecer(user);
  } catch (err) {
    console.error("Falló el envío de 'olvidé mi contraseña':", err instanceof Error ? err.message : err);
  }
}

// Poner contraseña nueva con el enlace del correo.
router.post("/restablecer", validar(restablecerSchema), async (req, res) => {
  const { token, password } = req.body as RestablecerInput;
  const datos = await consumirToken(token, "RESET");
  if (!datos) {
    return res.status(400).json({ error: ENLACE_INVALIDO });
  }

  // El enlace se mandó a un correo: si el usuario ya no lo usa, ese correo ya no manda aquí.
  const user = await prisma.user.findUnique({ where: { id: datos.userId } });
  if (!user || user.email !== datos.email) {
    return res.status(400).json({ error: ENLACE_INVALIDO });
  }
  if (!user.activo) {
    return res.status(403).json({ error: "Tu usuario está desactivado. Habla con el dueño del negocio." });
  }

  const ahora = segundoActual();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 10),
        // Cierra las sesiones abiertas (verificarToken compara el iat con esto).
        passwordCambiadaEn: ahora,
        // Abrir un enlace mandado a ese correo prueba que es suyo.
        emailVerificado: user.emailVerificado ?? new Date(),
      },
    }),
    // Cualquier otro enlace de restablecer que quedara pendiente ya no sirve.
    prisma.tokenCorreo.updateMany({ where: { userId: user.id, tipo: "RESET", usadoEn: null }, data: { usadoEn: new Date() } }),
  ]);

  res.json({ mensaje: "Tu contraseña cambió. Ya puedes iniciar sesión." });
});

export default router;
