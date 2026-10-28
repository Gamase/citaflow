import { Request, Response, Router } from "express";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import { soloDueno, verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import {
  activoSchema,
  editarEmpleadoSchema,
  empleadoSchema,
  passwordEmpleadoSchema,
  ActivoInput,
  EditarEmpleadoInput,
  EmpleadoInput,
  PasswordEmpleadoInput,
} from "../schemas";

const router = Router();
const prisma = new PrismaClient();

// El equipo del negocio: todo es solo para el dueño.
router.use(verificarToken, soloDueno);

// Lo que se regresa de cada usuario (nunca el hash de la contraseña).
const USUARIO = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  creadoEn: true,
} satisfies Prisma.UserSelect;

router.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: req.tenantId as string },
    select: USUARIO,
    // El dueño primero (DUENO va antes que EMPLEADO en el enum), luego por antigüedad.
    orderBy: [{ rol: "asc" }, { creadoEn: "asc" }],
  });
  res.json(users);
});

router.get("/:id", async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
    select: USUARIO,
  });

  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }
  res.json(user);
});

router.post("/", validar(empleadoSchema), async (req, res) => {
  const { nombre, email, password } = req.body as EmpleadoInput;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        nombre,
        email,
        password: hashedPassword,
        rol: "EMPLEADO",
        tenantId: req.tenantId as string,
      },
      select: USUARIO,
    });
    res.status(201).json(user);
  } catch (err) {
    // El email es único en todo CitaFlow (con él se hace login), no solo en el negocio.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }
    throw err;
  }
});

// Editar y restablecer contraseña: solo a empleados del negocio. Los datos del propio
// dueño se cambiarán en "Ajustes", no aquí. Responde el error y regresa null si no aplica.
async function empleadoEditable(req: Request<Record<string, string>>, res: Response) {
  if (req.params.id === req.userId) {
    res.status(409).json({ error: "Tus propios datos no se editan desde Equipo" });
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return null;
  }
  if (user.rol !== "EMPLEADO") {
    res.status(409).json({ error: "Solo se pueden editar empleados" });
    return null;
  }
  return user;
}

router.patch("/:id", validar(editarEmpleadoSchema), async (req, res) => {
  const { nombre, email } = req.body as EditarEmpleadoInput;
  const user = await empleadoEditable(req, res);
  if (!user) return;

  try {
    const actualizado = await prisma.user.update({
      where: { id: user.id, tenantId: req.tenantId as string },
      data: { nombre, email },
      select: USUARIO,
    });
    res.json(actualizado);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ese correo ya está registrado" });
    }
    throw err;
  }
});

// El dueño no ve contraseñas: solo asigna una temporal nueva y se la comparte al empleado.
router.patch("/:id/password", validar(passwordEmpleadoSchema), async (req, res) => {
  const { password } = req.body as PasswordEmpleadoInput;
  const user = await empleadoEditable(req, res);
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id, tenantId: req.tenantId as string },
    data: { password: await bcrypt.hash(password, 10) },
  });
  res.status(204).end();
});

// Desactivar o reactivar. Nada se borra: el usuario desactivado conserva su historial
// y pierde el acceso en su siguiente petición (verificarToken revisa `activo`).
router.patch("/:id/activo", validar(activoSchema), async (req, res) => {
  const { activo } = req.body as ActivoInput;

  if (req.params.id === req.userId) {
    return res.status(409).json({ error: "No puedes desactivarte a ti mismo" });
  }

  const user = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  const actualizado = await prisma.user.update({
    where: { id: user.id, tenantId: req.tenantId as string },
    data: { activo },
    select: USUARIO,
  });
  res.json(actualizado);
});

export default router;
