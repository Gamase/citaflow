import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { verificarToken } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

router.get("/", async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: { tenantId: req.tenantId },
    include: { client: true, service: true },
    orderBy: { fechaHora: "asc" },
  });
  res.json(appointments);
});

router.post("/", async (req, res) => {
  const { clientId, serviceId, fechaHora } = req.body;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId: req.tenantId },
  });

  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }

  const inicio = new Date(fechaHora);
  const fin = new Date(inicio.getTime() + service.duracionMin * 60000);

  const conflicto = await prisma.appointment.findFirst({
    where: {
      tenantId: req.tenantId,
      estado: { not: "CANCELADA" },
      AND: [
        { fechaHora: { lt: fin } },
        {
          fechaHora: {
            gte: new Date(inicio.getTime() - 24 * 60 * 60000),
          },
        },
      ],
    },
    include: { service: true },
  });

  if (conflicto) {
    const conflictoInicio = new Date(conflicto.fechaHora);
    const conflictoFin = new Date(
      conflictoInicio.getTime() + conflicto.service.duracionMin * 60000
    );
    const hayChoque = inicio < conflictoFin && fin > conflictoInicio;

    if (hayChoque) {
      return res.status(409).json({ error: "Ya hay una cita en ese horario" });
    }
  }

  const appointment = await prisma.appointment.create({
    data: {
      fechaHora: inicio,
      tenantId: req.tenantId as string,
      clientId,
      serviceId,
    },
  });

  res.status(201).json(appointment);
});

router.patch("/:id/cancelar", async (req, res) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId },
  });

  if (!appointment) {
    return res.status(404).json({ error: "Cita no encontrada" });
  }

  const actualizada = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { estado: "CANCELADA" },
  });

  res.json(actualizada);
});

export default router;
