import { Router } from "express";
import { EstadoCita, Prisma } from "@prisma/client";
import type { ClienteTenant } from "../db";
import { verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import {
  citaSchema,
  estadoSchema,
  filtroCitasSchema,
  reagendarSchema,
  reasignarSchema,
  CitaInput,
  EstadoInput,
  FiltroCitasInput,
  ReagendarInput,
  ReasignarInput,
} from "../schemas";

const router = Router();

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

// ¿El horario [inicio, inicio + duración) choca con alguna cita activa de la misma agenda?
// Cada persona tiene su propia agenda y "Sin asignar" (atiendeId null) es una agenda más:
// solo chocan citas de la misma persona, o dos sin asignar.
// Se revisan todas las que empiezan antes de que termine la nueva (ventana de 24 h
// hacia atrás: ningún servicio dura más que eso). `excluirId` deja fuera a la propia
// cita al reagendarla o reasignarla, para que no choque consigo misma.
async function hayChoque(
  db: ClienteTenant,
  tenantId: string,
  inicio: Date,
  duracionMin: number,
  atiendeId: string | null,
  excluirId?: string,
) {
  const fin = new Date(inicio.getTime() + duracionMin * 60000);

  const candidatas = await db.appointment.findMany({
    where: {
      tenantId,
      atiendeId,
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

// Lo que se regresa de cada cita. De quien atiende solo lo necesario para mostrarlo
// (y `activo`, para avisar si hay que reasignarla).
const CON_DETALLE = {
  client: true,
  service: true,
  atiende: { select: { id: true, nombre: true, activo: true } },
} satisfies Prisma.AppointmentInclude;

// Revisa que `atiendeId` sea alguien activo del negocio. null ("Sin asignar") siempre vale.
// De otro negocio o inexistente → 404 (como clientId/serviceId); inactiva → 400.
async function validarAtiende(db: ClienteTenant, tenantId: string, atiendeId: string | null) {
  if (atiendeId === null) return { ok: true as const, nombre: null };
  const persona = await db.user.findFirst({ where: { id: atiendeId, tenantId } });
  if (!persona) {
    return { ok: false as const, status: 404, error: "Persona no encontrada" };
  }
  if (!persona.activo) {
    return { ok: false as const, status: 400, error: "Esa persona está desactivada; asigna la cita a alguien activo" };
  }
  return { ok: true as const, nombre: persona.nombre };
}

function mensajeChoque(nombre: string | null) {
  return nombre ? `${nombre} ya tiene una cita en ese horario` : "Ya hay una cita en ese horario";
}

// Va antes de las rutas con /:id para que "personas" no se lea como un id.
// Personas activas a las que se les puede asignar una cita. Para todos (el empleado
// también agenda); sin email ni nada más que lo que pide el select.
router.get("/personas", async (req, res) => {
  const personas = await req.db.user.findMany({
    where: { tenantId: req.tenantId as string, activo: true },
    select: { id: true, nombre: true, rol: true },
    orderBy: [{ rol: "asc" }, { nombre: "asc" }],
  });
  res.json(personas);
});

router.get("/", validar(filtroCitasSchema, "query"), async (req, res) => {
  const { estado, atiende, desde, hasta } = res.locals.query as FiltroCitasInput;
  const appointments = await req.db.appointment.findMany({
    where: {
      tenantId: req.tenantId as string,
      ...(estado && { estado }),
      ...(atiende === "yo" && { atiendeId: req.userId as string }),
      ...(desde && hasta && { fechaHora: { gte: desde, lt: hasta } }),
    },
    include: CON_DETALLE,
    orderBy: { fechaHora: "asc" },
  });
  res.json(appointments);
});

router.post("/", validar(citaSchema), async (req, res) => {
  const { clientId, serviceId, fechaHora, atiendeId = null } = req.body as CitaInput;

  if (enElPasado(fechaHora)) {
    return res.status(400).json({ error: "No puedes agendar una cita en el pasado" });
  }

  const service = await req.db.service.findFirst({
    where: { id: serviceId, tenantId: req.tenantId as string },
  });

  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }

  const client = await req.db.client.findFirst({
    where: { id: clientId, tenantId: req.tenantId as string },
  });

  if (!client) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  const persona = await validarAtiende(req.db, req.tenantId as string, atiendeId);
  if (!persona.ok) {
    return res.status(persona.status).json({ error: persona.error });
  }

  if (await hayChoque(req.db, req.tenantId as string, fechaHora, service.duracionMin, atiendeId)) {
    return res.status(409).json({ error: mensajeChoque(persona.nombre) });
  }

  const appointment = await req.db.appointment.create({
    data: {
      fechaHora,
      tenantId: req.tenantId as string,
      clientId,
      serviceId,
      atiendeId,
      // Se congela el precio de hoy: si después cambia el del servicio, esta cita no cambia.
      precio: service.precio,
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

  const appointment = await req.db.appointment.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
    include: { service: true, atiende: true },
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

  // Se revisa en la agenda de quien la atiende. El precio no cambia al reagendar.
  if (
    await hayChoque(
      req.db,
      req.tenantId as string,
      fechaHora,
      appointment.service.duracionMin,
      appointment.atiendeId,
      appointment.id,
    )
  ) {
    return res.status(409).json({ error: mensajeChoque(appointment.atiende?.nombre ?? null) });
  }

  // Se condiciona al estado leído: si otra petición la canceló entre medio, no se mueve.
  const { count } = await req.db.appointment.updateMany({
    where: { id: appointment.id, tenantId: req.tenantId as string, estado: actual },
    data: { fechaHora },
  });

  if (count === 0) {
    return res.status(409).json({ error: "La cita cambió de estado mientras tanto. Recarga e intenta de nuevo." });
  }

  const actualizada = await req.db.appointment.findFirst({
    where: { id: appointment.id, tenantId: req.tenantId as string },
    include: CON_DETALLE,
  });

  res.json(actualizada);
});

// Reasignar a otra persona (o a "Sin asignar"): mismas validaciones que al crear y el
// choque se revisa en la agenda de la nueva persona. Solo en estados no finales.
router.patch("/:id/atiende", validar(reasignarSchema), async (req, res) => {
  const { atiendeId } = req.body as ReasignarInput;

  const appointment = await req.db.appointment.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
    include: { service: true },
  });

  if (!appointment) {
    return res.status(404).json({ error: "Cita no encontrada" });
  }

  const actual = appointment.estado;
  if (TRANSICIONES[actual].length === 0) {
    return res
      .status(409)
      .json({ error: `La cita está marcada como "${NOMBRE_ESTADO[actual]}" y ya no se puede reasignar` });
  }

  const persona = await validarAtiende(req.db, req.tenantId as string, atiendeId);
  if (!persona.ok) {
    return res.status(persona.status).json({ error: persona.error });
  }

  if (
    await hayChoque(
      req.db,
      req.tenantId as string,
      appointment.fechaHora,
      appointment.service.duracionMin,
      atiendeId,
      appointment.id,
    )
  ) {
    return res.status(409).json({ error: mensajeChoque(persona.nombre) });
  }

  // Se condiciona al estado leído: si otra petición la canceló entre medio, no se reasigna.
  const { count } = await req.db.appointment.updateMany({
    where: { id: appointment.id, tenantId: req.tenantId as string, estado: actual },
    data: { atiendeId },
  });

  if (count === 0) {
    return res.status(409).json({ error: "La cita cambió de estado mientras tanto. Recarga e intenta de nuevo." });
  }

  const actualizada = await req.db.appointment.findFirst({
    where: { id: appointment.id, tenantId: req.tenantId as string },
    include: CON_DETALLE,
  });

  res.json(actualizada);
});

router.patch("/:id/estado", validar(estadoSchema), async (req, res) => {
  const { estado: nuevo } = req.body as EstadoInput;

  const appointment = await req.db.appointment.findFirst({
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
  const { count } = await req.db.appointment.updateMany({
    where: { id: appointment.id, tenantId: req.tenantId as string, estado: actual },
    data: { estado: nuevo },
  });

  if (count === 0) {
    return res.status(409).json({ error: "La cita cambió de estado mientras tanto. Recarga e intenta de nuevo." });
  }

  const actualizada = await req.db.appointment.findFirst({
    where: { id: appointment.id, tenantId: req.tenantId as string },
    include: CON_DETALLE,
  });

  res.json(actualizada);
});

export default router;
