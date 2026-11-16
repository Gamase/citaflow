import { Router } from "express";
import { EstadoCita, Prisma } from "@prisma/client";
import { hayChoque } from "../agenda";
import { conCandadoDelNegocio } from "../db";
import { fueraDeHorario } from "../horario";
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

// Tolerancia para agendar "ahora mismo" sin que el reloj del cliente lo rechace.
const MARGEN_PASADO_MS = 5 * 60000;

function enElPasado(fecha: Date) {
  return fecha.getTime() < Date.now() - MARGEN_PASADO_MS;
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
async function validarAtiende(tx: Prisma.TransactionClient, tenantId: string, atiendeId: string | null) {
  if (atiendeId === null) return { ok: true as const, nombre: null };
  const persona = await tx.user.findFirst({ where: { id: atiendeId, tenantId } });
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

// Agendar, reagendar y reasignar revisan (horario, choque) y guardan dentro de
// conCandadoDelNegocio (db.ts): así dos peticiones simultáneas no quedan encimadas, ni entre sí
// ni con una reserva de la página pública. Dentro del candado solo se usa `tx`.
// Lo que regresa esa parte: el resultado, o el status y el mensaje del error (como validarAtiende).
const falla = (status: number, error: string) => ({ ok: false as const, status, error });

router.post("/", validar(citaSchema), async (req, res) => {
  const { clientId, serviceId, fechaHora, atiendeId = null } = req.body as CitaInput;
  const tenantId = req.tenantId as string;

  if (enElPasado(fechaHora)) {
    return res.status(400).json({ error: "No puedes agendar una cita en el pasado" });
  }

  const resultado = await conCandadoDelNegocio(tenantId, async (tx) => {
    const service = await tx.service.findFirst({ where: { id: serviceId, tenantId } });
    if (!service) return falla(404, "Servicio no encontrado");

    const client = await tx.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) return falla(404, "Cliente no encontrado");

    const persona = await validarAtiende(tx, tenantId, atiendeId);
    if (!persona.ok) return persona;

    // Dentro del horario de apertura (si el negocio lo configuró): empieza y termina abierto.
    const motivoHorario = await fueraDeHorario(tx, tenantId, fechaHora, service.duracionMin);
    if (motivoHorario) return falla(400, motivoHorario);

    if (await hayChoque(tx, tenantId, fechaHora, service.duracionMin, atiendeId)) {
      return falla(409, mensajeChoque(persona.nombre));
    }

    const cita = await tx.appointment.create({
      data: {
        fechaHora,
        tenantId,
        clientId,
        serviceId,
        atiendeId,
        // Se congela el precio de hoy: si después cambia el del servicio, esta cita no cambia.
        precio: service.precio,
      },
    });
    return { ok: true as const, cita };
  });

  if (!resultado.ok) {
    return res.status(resultado.status).json({ error: resultado.error });
  }
  res.status(201).json(resultado.cita);
});

// Reagendar: solo cambia la fecha (el servicio y el estado se quedan igual).
router.patch("/:id", validar(reagendarSchema), async (req, res) => {
  const { fechaHora } = req.body as ReagendarInput;
  const tenantId = req.tenantId as string;
  const id = req.params.id;

  if (enElPasado(fechaHora)) {
    return res.status(400).json({ error: "No puedes mover una cita al pasado" });
  }

  const resultado = await conCandadoDelNegocio(tenantId, async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id, tenantId },
      include: { service: true, atiende: true },
    });
    if (!appointment) return falla(404, "Cita no encontrada");

    // Estado final = sin transiciones posibles (Atendida, No asistió, Cancelada).
    const actual = appointment.estado;
    if (TRANSICIONES[actual].length === 0) {
      return falla(409, `La cita está marcada como "${NOMBRE_ESTADO[actual]}" y ya no se puede reagendar`);
    }

    const duracionMin = appointment.service.duracionMin;
    const motivoHorario = await fueraDeHorario(tx, tenantId, fechaHora, duracionMin);
    if (motivoHorario) return falla(400, motivoHorario);

    // Se revisa en la agenda de quien la atiende. El precio no cambia al reagendar.
    if (await hayChoque(tx, tenantId, fechaHora, duracionMin, appointment.atiendeId, appointment.id)) {
      return falla(409, mensajeChoque(appointment.atiende?.nombre ?? null));
    }

    // Se condiciona al estado leído: si otra petición la canceló entre medio, no se mueve.
    // (Cambiar de estado no toma el candado: cancelar o marcar una cita no crea choques.)
    const { count } = await tx.appointment.updateMany({
      where: { id: appointment.id, tenantId, estado: actual },
      data: { fechaHora },
    });
    if (count === 0) {
      return falla(409, "La cita cambió de estado mientras tanto. Recarga e intenta de nuevo.");
    }

    const cita = await tx.appointment.findFirst({ where: { id: appointment.id, tenantId }, include: CON_DETALLE });
    return { ok: true as const, cita };
  });

  if (!resultado.ok) {
    return res.status(resultado.status).json({ error: resultado.error });
  }
  res.json(resultado.cita);
});

// Reasignar a otra persona (o a "Sin asignar"): mismas validaciones que al crear y el
// choque se revisa en la agenda de la nueva persona. Solo en estados no finales.
router.patch("/:id/atiende", validar(reasignarSchema), async (req, res) => {
  const { atiendeId } = req.body as ReasignarInput;
  const tenantId = req.tenantId as string;
  const id = req.params.id;

  const resultado = await conCandadoDelNegocio(tenantId, async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id, tenantId },
      include: { service: true },
    });
    if (!appointment) return falla(404, "Cita no encontrada");

    const actual = appointment.estado;
    if (TRANSICIONES[actual].length === 0) {
      return falla(409, `La cita está marcada como "${NOMBRE_ESTADO[actual]}" y ya no se puede reasignar`);
    }

    const persona = await validarAtiende(tx, tenantId, atiendeId);
    if (!persona.ok) return persona;

    if (
      await hayChoque(tx, tenantId, appointment.fechaHora, appointment.service.duracionMin, atiendeId, appointment.id)
    ) {
      return falla(409, mensajeChoque(persona.nombre));
    }

    // Se condiciona al estado leído: si otra petición la canceló entre medio, no se reasigna.
    const { count } = await tx.appointment.updateMany({
      where: { id: appointment.id, tenantId, estado: actual },
      data: { atiendeId },
    });
    if (count === 0) {
      return falla(409, "La cita cambió de estado mientras tanto. Recarga e intenta de nuevo.");
    }

    const cita = await tx.appointment.findFirst({ where: { id: appointment.id, tenantId }, include: CON_DETALLE });
    return { ok: true as const, cita };
  });

  if (!resultado.ok) {
    return res.status(resultado.status).json({ error: resultado.error });
  }
  res.json(resultado.cita);
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
