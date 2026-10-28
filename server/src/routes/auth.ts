import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { firmarToken } from "../middleware/auth";
import { Prisma } from "@prisma/client";
import { validar } from "../middleware/validar";
import { limiteLogin, limiteRegistro } from "../middleware/limites";
import { loginSchema, registroSchema, LoginInput, RegistroInput } from "../schemas";

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

  const token = firmarToken(user.id, tenant.id);

  res.status(201).json({
    token,
    tenant: { id: tenant.id, nombre: tenant.nombre },
    user: { nombre: user.nombre, email: user.email, rol: user.rol },
  });
});

router.post("/login", limiteLogin, validar(loginSchema), async (req, res) => {
  const { email, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: { select: { id: true, nombre: true } } },
  });

  if (!user) {
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
    user: { nombre: user.nombre, email: user.email, rol: user.rol },
  });
});

export default router;
