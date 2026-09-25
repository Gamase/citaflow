import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { verificarToken } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

router.get("/", async (req, res) => {
  const services = await prisma.service.findMany({
    where: { tenantId: req.tenantId },
  });
  res.json(services);
});

router.post("/", async (req, res) => {
  const { nombre, duracionMin, precio } = req.body;

  const existente = await prisma.service.findFirst({
    where: {
      tenantId: req.tenantId,
      nombre: { equals: nombre.trim(), mode: "insensitive" },
    },
  });

  if (existente) {
    return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
  }

  try {
    const service = await prisma.service.create({
      data: { nombre: nombre.trim(), duracionMin, precio, tenantId: req.tenantId as string },
    });
    res.status(201).json(service);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
    }
    throw err;
  }
});

export default router;
