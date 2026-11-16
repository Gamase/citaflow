import { enviarCorreo } from "./correo";
import { clienteDelTenant, prisma } from "./db";

// Correos al cliente sobre su cita: confirmación (al agendar, reservar en línea o reagendar) y
// recordatorio (~24 h antes, lo dispara POST /tareas/recordatorios).
// Llevan solo lo de ESA cita: negocio, servicio, día y hora (en la zona del negocio), con quién
// (nombre de pila) y si está pendiente o confirmada. Sin precios, sin enlaces, nada de nadie más.

export const VENTANA_RECORDATORIO_MS = 24 * 60 * 60000;

export interface DatosAviso {
  para: string;
  negocio: string;
  zonaHoraria: string;
  servicio: string;
  fechaHora: Date;
  // Nombre completo de quien atiende (aquí se recorta al de pila) o null.
  atiende: string | null;
  estado: string;
}

// Lo que se guarda en la cita al agendarla o moverla: a qué correo avisar y, si empieza en menos
// de 24 h, el recordatorio ya dado por mandado (la confirmación que sale ahora hace de
// recordatorio; el cron no manda otro correo casi pegado).
export function avisosAlAgendar(email: string | null | undefined, fechaHora: Date) {
  const emailAviso = email ?? null;
  const pronto = fechaHora.getTime() - Date.now() < VENTANA_RECORDATORIO_MS;
  return { emailAviso, recordatorioEnviadoEn: emailAviso && pronto ? new Date() : null };
}

function cuando(d: DatosAviso) {
  const fecha = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: d.zonaHoraria }).format(d.fechaHora);
  const hora = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: d.zonaHoraria }).format(d.fechaHora);
  return `${fecha} a las ${hora}`;
}

function detalle(d: DatosAviso) {
  const pila = d.atiende?.trim().split(/\s+/)[0];
  // Sin punto final: la hora ya termina en "a.m." o "p.m.".
  return `${d.servicio} en ${d.negocio}${pila ? `, con ${pila}` : ""}: ${cuando(d)}`;
}

const PIE = "Si necesitas cambiar o cancelar tu cita, comunícate directamente con el negocio. Este correo se mandó porque se registró una cita con esta dirección; si no fuiste tú, ignóralo.";

type Tipo = "confirmacion" | "cambio" | "recordatorio";

function correoDe(tipo: Tipo, d: DatosAviso) {
  const pendiente = d.estado === "PENDIENTE";
  if (tipo === "recordatorio") {
    return {
      asunto: `Recordatorio: tu cita en ${d.negocio}`,
      parrafos: ["Te recordamos tu cita:", detalle(d), ...(pendiente ? ["El negocio todavía no la confirma; si tienes dudas, comunícate con ellos."] : [])],
    };
  }
  return {
    asunto: tipo === "cambio" ? `Tu cita en ${d.negocio} cambió de horario` : `Tu cita en ${d.negocio}`,
    parrafos: [
      tipo === "cambio" ? "Tu cita cambió de horario. Quedó así:" : "Tu cita quedó registrada:",
      detalle(d),
      pendiente ? "Está pendiente: el negocio la confirmará contigo." : "El negocio ya la confirmó.",
    ],
  };
}

// Manda el aviso SIN esperarlo ni lanzar: se llama después de guardar la cita (y fuera del
// candado), así que un fallo del correo nunca tumba la reserva. Sin correo no hace nada.
export function avisarCita(tipo: Tipo, d: Omit<DatosAviso, "para"> & { para: string | null }) {
  if (!d.para) return;
  const datos = { ...d, para: d.para };
  void enviarCorreo({ para: datos.para, ...correoDe(tipo, datos), pie: PIE }).catch((err) =>
    console.error("No se pudo mandar el aviso de la cita:", err instanceof Error ? err.message : err),
  );
}

// El trabajo del recordatorio. Negocio por negocio con su cliente (RLS aplica, sin bypass):
// citas Pendientes o Confirmadas que empiezan en las próximas 24 h, con correo y sin marca.
// Cada una se "aparta" con un updateMany condicionado a que siga sin marca: si dos llamadas
// corren a la vez, solo una la aparta y solo esa manda el correo. Si el envío falla después de
// apartarla, ese recordatorio se pierde (mejor perder uno que mandar dos).
export async function mandarRecordatorios() {
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + VENTANA_RECORDATORIO_MS);
  let enviados = 0;
  let fallidos = 0;

  const negocios = await prisma.tenant.findMany({ select: { id: true, nombre: true, zonaHoraria: true } });
  for (const negocio of negocios) {
    const db = clienteDelTenant(negocio.id);
    const pendientes = { tenantId: negocio.id, estado: { in: ["PENDIENTE", "CONFIRMADA"] as ("PENDIENTE" | "CONFIRMADA")[] }, recordatorioEnviadoEn: null };
    const citas = await db.appointment.findMany({
      where: { ...pendientes, emailAviso: { not: null }, fechaHora: { gt: ahora, lte: hasta } },
      select: { id: true, fechaHora: true, estado: true, emailAviso: true, service: { select: { nombre: true } }, atiende: { select: { nombre: true } } },
    });
    for (const c of citas) {
      const { count } = await db.appointment.updateMany({ where: { ...pendientes, id: c.id }, data: { recordatorioEnviadoEn: new Date() } });
      if (count === 0) continue; // otra llamada la apartó, o cambió de estado
      const ok = await enviarCorreo({
        para: c.emailAviso as string,
        ...correoDe("recordatorio", {
          para: c.emailAviso as string,
          negocio: negocio.nombre,
          zonaHoraria: negocio.zonaHoraria,
          servicio: c.service.nombre,
          fechaHora: c.fechaHora,
          atiende: c.atiende?.nombre ?? null,
          estado: c.estado,
        }),
        pie: PIE,
      });
      if (ok) enviados++;
      else fallidos++;
    }
  }
  return { enviados, fallidos };
}
