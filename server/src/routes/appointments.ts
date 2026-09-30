import { Router } from "express";
import { EstadoCita, PrismaClient } from "@prisma/client";
import { verificarToken } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

// Ciclo de vida de una cita: a qué estados puede pasar desde cada uno.
// Los estados finales (sin transiciones) ya no se mueven.
const TRANSICIONES: Record<EstadoCita, EstadoCita[]> = {
  PENDIENTE: ["CONFIRMADA", "COMPLETADA", "NO_ASISTIO", "CANCELADA"],
  CONFIRMADA: ["COMPLETADA", "NO_ASISTIO", "CANCELADA"],
  COMPLETADA: [],
  NO_ASISTIO: [],
  CANCELADA: [],
};

// Estados que solo tienen sentido cuando la cita ya empezó.
const SOLO_DESPUES_DEL_INICIO: Partial<Record<EstadoCita, string>> = {
  COMPLETADA: "No puedes marcar como atendida una cita que aún no ocurre",
  NO_ASISTIO: "No puedes marcar como no asistió una cita que aún no ocurre",
};

// Estados que ya no ocupan su horario: se puede agendar otra cita encima.
const LIBERAN_HORARIO: EstadoCita[] = ["CANCELADA", "NO_ASISTIO"];

const NOMBRE_ESTADO: Record<EstadoCita, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADA: "Confirmada",
  COMPLETADA: "Atendida",
  NO_ASISTIO: "No asistió",
  CANCELADA: "Cancelada",
};

router.get("/", async (req, res) => {
  const appointments = await prisma.appointment.findMany({
    where: { tenantId: req.tenantId as string },
    include: { client: true, service: true },
    orderBy: { fechaHora: "asc" },
  });
  res.json(appointments);
});

router.post("/", async (req, res) => {
  const { clientId, serviceId, fechaHora } = req.body;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId: req.tenantId as string },
  });

  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }

  const inicio = new Date(fechaHora);
  const fin = new Date(inicio.getTime() + service.duracionMin * 60000);

  // Todas las citas activas que empiezan antes de que termine la nueva
  // (ventana de 24 h hacia atrás: ningún servicio dura más que eso).
  const candidatas = await prisma.appointment.findMany({
    where: {
      tenantId: req.tenantId as string,
      estado: { notIn: LIBERAN_HORARIO },
      fechaHora: {
        lt: fin,
        gte: new Date(inicio.getTime() - 24 * 60 * 60000),
      },
    },
    include: { service: true },
  });

  const hayChoque = candidatas.some((c) => {
    const cInicio = new Date(c.fechaHora);
    const cFin = new Date(cInicio.getTime() + c.service.duracionMin * 60000);
    return inicio < cFin && fin > cInicio;
  });

  if (hayChoque) {
    return res.status(409).json({ error: "Ya hay una cita en ese horario" });
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

router.patch("/:id/estado", async (req, res) => {
  const { estado } = req.body as { estado?: string };

  if (typeof estado !== "string" || !Object.hasOwn(TRANSICIONES, estado)) {
    return res.status(400).json({ error: "Estado no válido" });
  }
  const nuevo = estado as EstadoCita;

  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!appointment) {
    return res.status(404).json({ error: "Cita no encontrada" });
  }

  const actual = appointment.estado;
  if (!TRANSICIONES[actual].includes(nuevo)) {
    const error =
      TRANSICIONES[actual].length === 0
        ? `La cita está marcada como "${NOMBRE_ESTADO[actual]}" y ya no puede cambiar de estado`
        : `No se puede pasar de ${NOMBRE_ESTADO[actual]} a ${NOMBRE_ESTADO[nuevo]}`;
    return res.status(409).json({ error });
  }

  const errorFuturo = SOLO_DESPUES_DEL_INICIO[nuevo];
  if (errorFuturo && appointment.fechaHora > new Date()) {
    return res.status(409).json({ error: errorFuturo });
  }

  // Se condiciona al estado leído: si otra petición lo cambió entre medio, no se pisa.
  const { count } = await prisma.appointment.updateMany({
    where: { id: appointment.id, tenantId: req.tenantId as string, estado: actual },
    data: { estado: nuevo },
  });

  if (count === 0) {
    return res.status(409).json({ error: "La cita cambió de estado mientras tanto. Recarga e intenta de nuevo." });
  }

  const actualizada = await prisma.appointment.findFirst({
    where: { id: appointment.id, tenantId: req.tenantId as string },
    include: { client: true, service: true },
  });

  res.json(actualizada);
});

export default router;
