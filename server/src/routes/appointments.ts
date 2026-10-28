import { Router } from "express";
import { EstadoCita, PrismaClient } from "@prisma/client";
import { verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import {
  citaSchema,
  estadoSchema,
  filtroCitasSchema,
  reagendarSchema,
  CitaInput,
  EstadoInput,
  FiltroCitasInput,
  ReagendarInput,
} from "../schemas";

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

// Tolerancia para agendar "ahora mismo" sin que el reloj del cliente lo rechace.
const MARGEN_PASADO_MS = 5 * 60000;

function enElPasado(fecha: Date) {
  return fecha.getTime() < Date.now() - MARGEN_PASADO_MS;
}

// ¿El horario [inicio, inicio + duración) choca con alguna cita activa del tenant?
// Se revisan todas las que empiezan antes de que termine la nueva (ventana de 24 h
// hacia atrás: ningún servicio dura más que eso). `excluirId` deja fuera a la propia
// cita al reagendarla, para que no choque consigo misma.
async function hayChoque(tenantId: string, inicio: Date, duracionMin: number, excluirId?: string) {
  const fin = new Date(inicio.getTime() + duracionMin * 60000);

  const candidatas = await prisma.appointment.findMany({
    where: {
      tenantId,
      id: excluirId ? { not: excluirId } : undefined,
      estado: { notIn: LIBERAN_HORARIO },
      fechaHora: {
        lt: fin,
        gte: new Date(inicio.getTime() - 24 * 60 * 60000),
      },
    },
    include: { service: true },
  });

  return candidatas.some((c) => {
    const cInicio = new Date(c.fechaHora);
    const cFin = new Date(cInicio.getTime() + c.service.duracionMin * 60000);
    return inicio < cFin && fin > cInicio;
  });
}

const NOMBRE_ESTADO: Record<EstadoCita, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADA: "Confirmada",
  COMPLETADA: "Atendida",
  NO_ASISTIO: "No asistió",
  CANCELADA: "Cancelada",
};

router.get("/", validar(filtroCitasSchema, "query"), async (req, res) => {
  const { estado, desde, hasta } = res.locals.query as FiltroCitasInput;
  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: req.tenantId as string,
      ...(estado && { estado }),
      ...(desde && hasta && { fechaHora: { gte: desde, lt: hasta } }),
    },
    include: { client: true, service: true },
    orderBy: { fechaHora: "asc" },
  });
  res.json(appointments);
});

router.post("/", validar(citaSchema), async (req, res) => {
  const { clientId, serviceId, fechaHora } = req.body as CitaInput;

  if (enElPasado(fechaHora)) {
    return res.status(400).json({ error: "No puedes agendar una cita en el pasado" });
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId: req.tenantId as string },
  });

  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId: req.tenantId as string },
  });

  if (!client) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  if (await hayChoque(req.tenantId as string, fechaHora, service.duracionMin)) {
    return res.status(409).json({ error: "Ya hay una cita en ese horario" });
  }

  const appointment = await prisma.appointment.create({
    data: {
      fechaHora,
      tenantId: req.tenantId as string,
      clientId,
      serviceId,
    },
  });

  res.status(201).json(appointment);
});

// Reagendar: solo cambia la fecha (el servicio y el estado se quedan igual).
router.patch("/:id", validar(reagendarSchema), async (req, res) => {
  const { fechaHora } = req.body as ReagendarInput;

  if (enElPasado(fechaHora)) {
    return res.status(400).json({ error: "No puedes mover una cita al pasado" });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
    include: { service: true },
  });

  if (!appointment) {
    return res.status(404).json({ error: "Cita no encontrada" });
  }

  // Estado final = sin transiciones posibles (Atendida, No asistió, Cancelada).
  const actual = appointment.estado;
  if (TRANSICIONES[actual].length === 0) {
    return res
      .status(409)
      .json({ error: `La cita está marcada como "${NOMBRE_ESTADO[actual]}" y ya no se puede reagendar` });
  }

  if (await hayChoque(req.tenantId as string, fechaHora, appointment.service.duracionMin, appointment.id)) {
    return res.status(409).json({ error: "Ya hay una cita en ese horario" });
  }

  // Se condiciona al estado leído: si otra petición la canceló entre medio, no se mueve.
  const { count } = await prisma.appointment.updateMany({
    where: { id: appointment.id, tenantId: req.tenantId as string, estado: actual },
    data: { fechaHora },
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

router.patch("/:id/estado", validar(estadoSchema), async (req, res) => {
  const { estado: nuevo } = req.body as EstadoInput;

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
