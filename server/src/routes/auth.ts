import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

router.post("/register", async (req, res) => {
  const { nombreNegocio, email, password, nombreUsuario } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const tenant = await prisma.tenant.create({
    data: {
      nombre: nombreNegocio,
      users: {
        create: {
          email,
          password: hashedPassword,
          nombre: nombreUsuario,
        },
      },
    },
    include: { users: true },
  });

  const user = tenant.users[0];

  if (!user) {
    return res.status(500).json({ error: "No se pudo crear el usuario" });
  }

  const token = jwt.sign(
    { userId: user.id, tenantId: tenant.id },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  res.status(201).json({ token, tenant: { id: tenant.id, nombre: tenant.nombre } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const passwordValida = await bcrypt.compare(password, user.password);

  if (!passwordValida) {
    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenantId },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

export default router;
