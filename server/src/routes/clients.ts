import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
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

  if (!/^\d{10}$/.test(telefono)) {
    return res.status(400).json({ error: "El teléfono debe tener 10 dígitos" });
  }

  try {
    const client = await prisma.client.create({
      data: { nombre, telefono, email, tenantId: req.tenantId as string },
    });
    res.status(201).json(client);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un cliente con ese teléfono" });
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
  });

  if (!client) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  const citasLigadas = await prisma.appointment.count({
    where: { clientId: client.id },
  });

  if (citasLigadas > 0) {
    return res.status(409).json({ error: "No se puede eliminar: tiene citas asociadas" });
  }

  await prisma.client.delete({ where: { id: client.id } });
  res.status(204).send();
});

export default router;
