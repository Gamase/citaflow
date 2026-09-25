import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { verificarToken } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

router.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { tenantId: req.tenantId },
  });
  res.json(clients);
});

router.post("/", async (req, res) => {
  const { nombre, telefono, email } = req.body;

  const client = await prisma.client.create({
    data: { nombre, telefono, email, tenantId: req.tenantId as string },
  });

  res.status(201).json(client);
});

export default router;
