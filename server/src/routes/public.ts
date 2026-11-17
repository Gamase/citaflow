import { Router, RequestHandler } from "express";
import { LIBERAN_HORARIO, hayChoque, seEnciman, sumarMinutos } from "../agenda";
import { avisarCita, avisosAlAgendar } from "../avisosCita";
import { clienteDelTenant, conCandadoDelNegocio, prisma } from "../db";
import { diaSemanaDe, enZona, fueraDeHorario, instanteEnZona } from "../horario";
import { limitePublicoLectura, limiteReservaIntentos, limiteReservasCreadas } from "../middleware/limites";
import { validar } from "../middleware/validar";
import { huecosSchema, reservaSchema, HuecosInput, ReservaInput } from "../schemas";
import { SLUG_VALIDO } from "../slug";

// Página pública de reservas (/reservar/<slug> en el front): el cliente final, sin cuenta, pide
// una cita en un negocio. No hay token, así que:
// - El negocio sale del slug de la URL, NUNCA del body (ver negocioDelSlug).
// - Solo se expone lo necesario para reservar: nombre del negocio, servicios con duración y
//   precio, nombre de pila del personal y horas libres. Nada de otros clientes ni de sus citas.
// - Todo va con rate limit por IP (middleware/limites.ts).
const router = Router();

const NO_RECIBE = "Este negocio aún no recibe reservas en línea";
// Con cuánta anticipación se puede reservar: al menos 1 hora antes y hasta 30 días adelante.
const ANTICIPACION_MS = 60 * 60000;
const DIAS_ADELANTE = 30;
const HORIZONTE_MS = DIAS_ADELANTE * 24 * 60 * 60000;
// Las horas se ofrecen de 30 en 30 minutos a partir de la apertura (el horario también va así).
const PASO_MIN = 30;
// Nadie comprueba que el teléfono sea de quien reserva: un mismo teléfono con este número de
// citas por venir ya no puede pedir otra en línea (que llame al negocio).
const MAX_CITAS_POR_VENIR = 3;

interface Negocio {
  id: string;
  nombre: string;
  zonaHoraria: string;
}

// El negocio de la URL. Tenant no tiene RLS (como en el login, aquí todavía no se sabe de qué
// negocio se trata): se busca con el prisma base. De ahí en adelante todo pasa por req.db
// (clienteDelTenant), igual que en las rutas con token: RLS aplica y cada query filtra por
// tenantId.
const negocioDelSlug: RequestHandler<{ slug: string }> = async (req, res, next) => {
  const { slug } = req.params;
  const negocio: Negocio | null =
    slug.length <= 60 && SLUG_VALIDO.test(slug)
      ? await prisma.tenant.findUnique({ where: { slug }, select: { id: true, nombre: true, zonaHoraria: true } })
      : null;
  if (!negocio) {
    res.status(404).json({ error: "No encontramos ese negocio" });
    return;
  }
  req.tenantId = negocio.id;
  req.db = clienteDelTenant(negocio.id);
  res.locals.negocio = negocio;
  next();
};

function nombreDePila(nombre: string) {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

// A quién se le asigna una reserva en línea:
// - A quien eligió el cliente, si es alguien activo de este negocio (si no, `false`).
// - Sin elegir: si el negocio tiene una sola persona activa, a ella (no hay a quién más);
//   si tiene varias, a "Sin asignar" (null), que es una agenda más.
function agendaDe(activos: { id: string }[], pedida: string | null | undefined): string | null | false {
  if (pedida) return activos.some((u) => u.id === pedida) ? pedida : false;
  return activos.length === 1 ? activos[0]!.id : null;
}

const falla = (status: number, error: string) => ({ ok: false as const, status, error });

// Lo que la página necesita para armar el formulario.
router.get("/:slug", limitePublicoLectura, negocioDelSlug, async (req, res) => {
  const tenantId = req.tenantId as string;
  const negocio = res.locals.negocio as Negocio;

  const [horario, servicios, activos] = await Promise.all([
    req.db.horarioDia.findMany({
      where: { tenantId },
      select: { diaSemana: true, abreMin: true, cierraMin: true },
      orderBy: { diaSemana: "asc" },
    }),
    req.db.service.findMany({
      where: { tenantId },
      select: { id: true, nombre: true, duracionMin: true, precio: true },
      orderBy: { nombre: "asc" },
    }),
    req.db.user.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true },
      orderBy: [{ rol: "asc" }, { nombre: "asc" }],
    }),
  ]);

  // Sin horario (o sin servicios que ofrecer) el negocio no recibe reservas: solo se dice su nombre.
  if (horario.length === 0 || servicios.length === 0) {
    return res.json({ nombre: negocio.nombre, recibeReservas: false });
  }

  res.json({
    nombre: negocio.nombre,
    recibeReservas: true,
    // Las horas se muestran en la zona del negocio, esté donde esté quien reserva.
    zonaHoraria: negocio.zonaHoraria,
    diasAdelante: DIAS_ADELANTE,
    horario,
    servicios,
    // Del personal, solo el id y el nombre de pila. Con una sola persona activa no hay nada que
    // elegir: la lista va vacía, el paso "¿con quién?" no aparece y la reserva se le asigna a ella.
    personal: activos.length > 1 ? activos.map((p) => ({ id: p.id, nombre: nombreDePila(p.nombre) })) : [],
  });
});

// Horas libres de un día para un servicio (y una persona, si se eligió). Solo regresa los
// instantes de inicio: nunca quién tiene cita ni a qué hora.
router.get("/:slug/huecos", limitePublicoLectura, negocioDelSlug, validar(huecosSchema, "query"), async (req, res) => {
  const tenantId = req.tenantId as string;
  const negocio = res.locals.negocio as Negocio;
  const { serviceId, fecha, atiendeId: pedida } = res.locals.query as HuecosInput;

  const [horario, service, activos] = await Promise.all([
    req.db.horarioDia.findMany({ where: { tenantId } }),
    req.db.service.findFirst({ where: { id: serviceId, tenantId } }),
    req.db.user.findMany({ where: { tenantId, activo: true }, select: { id: true } }),
  ]);
  if (horario.length === 0) {
    return res.status(409).json({ error: NO_RECIBE });
  }
  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }
  const atiendeId = agendaDe(activos, pedida);
  if (atiendeId === false) {
    return res.status(404).json({ error: "Persona no encontrada" });
  }

  // Candidatas: cada 30 min desde que abre, mientras el servicio alcance a terminar antes del
  // cierre, con la anticipación mínima y dentro de los días que se pueden reservar.
  const tramo = horario.find((d) => d.diaSemana === diaSemanaDe(fecha));
  const ahora = Date.now();
  const candidatas: Date[] = [];
  if (tramo) {
    for (let min = tramo.abreMin; min + service.duracionMin <= tramo.cierraMin; min += PASO_MIN) {
      const inicio = instanteEnZona(fecha, min, negocio.zonaHoraria);
      if (inicio.getTime() >= ahora + ANTICIPACION_MS && inicio.getTime() <= ahora + HORIZONTE_MS) {
        candidatas.push(inicio);
      }
    }
  }
  if (candidatas.length === 0) {
    return res.json({ fecha, huecos: [] });
  }

  // Se quitan las que se enciman con una cita activa de esa agenda (misma regla que hayChoque;
  // 24 h hacia atrás porque ningún servicio dura más).
  const ocupadas = await req.db.appointment.findMany({
    where: {
      tenantId,
      atiendeId,
      estado: { notIn: LIBERAN_HORARIO },
      fechaHora: {
        gte: sumarMinutos(candidatas[0]!, -24 * 60),
        lt: sumarMinutos(candidatas[candidatas.length - 1]!, service.duracionMin),
      },
    },
    select: { fechaHora: true, service: { select: { duracionMin: true } } },
  });
  const libres = candidatas.filter((inicio) => {
    const fin = sumarMinutos(inicio, service.duracionMin);
    return !ocupadas.some((c) => seEnciman(inicio, fin, c.fechaHora, sumarMinutos(c.fechaHora, c.service.duracionMin)));
  });

  res.json({ fecha, huecos: libres.map((d) => d.toISOString()) });
});

// Reservar. La cita entra PENDIENTE y marcada EN_LINEA: nadie comprobó que el teléfono sea de
// quien reserva, así que el negocio la confirma.
router.post(
  "/:slug/reservas",
  limiteReservaIntentos,
  negocioDelSlug,
  limiteReservasCreadas,
  validar(reservaSchema),
  async (req, res) => {
    const tenantId = req.tenantId as string;
    const negocio = res.locals.negocio as Negocio;
    const { serviceId, atiendeId: pedida, fechaHora, nombre, telefono, email } = req.body as ReservaInput;

    const falta = fechaHora.getTime() - Date.now();
    if (falta < ANTICIPACION_MS) {
      return res.status(400).json({ error: "Las reservas en línea se hacen con al menos 1 hora de anticipación" });
    }
    if (falta > HORIZONTE_MS) {
      return res.status(400).json({ error: `Solo se puede reservar con hasta ${DIAS_ADELANTE} días de anticipación` });
    }
    // Solo las horas que ofrece la página: en punto o y media (en la zona del negocio).
    if (fechaHora.getTime() % 60000 !== 0 || enZona(fechaHora, negocio.zonaHoraria).minutos % PASO_MIN !== 0) {
      return res.status(400).json({ error: "Elige una de las horas disponibles" });
    }

    // Revisar que el hueco siga libre y guardar van juntos, con el candado del negocio tomado
    // (el mismo que toma el panel): de dos personas que piden la misma hora al mismo tiempo,
    // solo entra una. Dentro del candado solo se usa `tx`.
    const resultado = await conCandadoDelNegocio(tenantId, async (tx) => {
      if ((await tx.horarioDia.count({ where: { tenantId } })) === 0) return falla(409, NO_RECIBE);

      const service = await tx.service.findFirst({ where: { id: serviceId, tenantId } });
      if (!service) return falla(404, "Servicio no encontrado");

      const activos = await tx.user.findMany({ where: { tenantId, activo: true }, select: { id: true, nombre: true } });
      const atiendeId = agendaDe(activos, pedida);
      if (atiendeId === false) return falla(404, "Persona no encontrada");

      const motivoHorario = await fueraDeHorario(tx, tenantId, fechaHora, service.duracionMin);
      if (motivoHorario) return falla(400, motivoHorario);

      if (await hayChoque(tx, tenantId, fechaHora, service.duracionMin, atiendeId)) {
        return falla(409, "Ese horario se acaba de ocupar. Elige otro.");
      }

      // El cliente se busca por su teléfono en ESTE negocio. Si ya existe se usa tal cual: lo
      // que escribió quien reserva no pisa su nombre ni su email (si no, cualquiera que supiera
      // un teléfono podría renombrar clientes). Si no existe, se crea.
      let client = await tx.client.findFirst({ where: { tenantId, telefono } });
      if (client) {
        const porVenir = await tx.appointment.count({
          where: {
            tenantId,
            clientId: client.id,
            fechaHora: { gte: new Date() },
            estado: { in: ["PENDIENTE", "CONFIRMADA"] },
          },
        });
        if (porVenir >= MAX_CITAS_POR_VENIR) {
          return falla(409, "Ya tienes varias citas por venir en este negocio. Para agendar otra, comunícate con el negocio.");
        }
      } else {
        client = await tx.client.create({ data: { tenantId, nombre, telefono, email } });
      }

      const cita = await tx.appointment.create({
        data: {
          tenantId,
          clientId: client.id,
          serviceId: service.id,
          fechaHora,
          atiendeId,
          // Como en el panel: el precio de hoy queda guardado en la cita.
          precio: service.precio,
          origen: "EN_LINEA",
          // Se avisa al correo que escribió quien reserva; si no puso, al que ya tenía el cliente.
          ...avisosAlAgendar(email ?? client.email, fechaHora),
        },
      });

      const atiende = activos.find((u) => u.id === atiendeId);
      return { ok: true as const, cita, service, atiende: atiende ? nombreDePila(atiende.nombre) : null };
    });

    if (!resultado.ok) {
      return res.status(resultado.status).json({ error: resultado.error });
    }

    // Ya guardada y fuera del candado: el correo no se espera ni puede tumbar la reserva.
    avisarCita("confirmacion", {
      para: resultado.cita.emailAviso,
      negocio: negocio.nombre,
      zonaHoraria: negocio.zonaHoraria,
      servicio: resultado.service.nombre,
      fechaHora: resultado.cita.fechaHora,
      atiende: resultado.atiende,
      estado: resultado.cita.estado,
    });

    // La confirmación que ve quien reservó: nada del cliente guardado (ni si ya existía).
    res.status(201).json({
      negocio: negocio.nombre,
      servicio: resultado.service.nombre,
      duracionMin: resultado.service.duracionMin,
      fechaHora: resultado.cita.fechaHora,
      atiende: resultado.atiende,
      estado: resultado.cita.estado,
    });
  },
);

export default router;
