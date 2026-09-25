import { Router } from "express";
import { PrismaClient } from "@prisma/client";
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

  const service = await prisma.service.create({
    data: {
      nombre,
      duracionMin,
      precio,
      tenantId: req.tenantId as string,
    },
  });

  res.status(201).json(service);
});

export default router;
