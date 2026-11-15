import type { ClienteTenant } from "./db";

// Horario de apertura del negocio: lo que hace falta para saber si una cita cae dentro.
// Las fechas de las citas son instantes (UTC); el horario está en la zona del negocio
// (Tenant.zonaHoraria), así que primero se traduce el instante a "qué día y qué hora es allá".

export const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const DIAS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Día de la semana (0 = domingo) y minutos desde medianoche de un instante, en una zona IANA.
export function enZona(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    diaSemana: DIAS_EN.indexOf(valor("weekday")),
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

// "540" → "9:00 a.m." (los minutos no dependen de ninguna zona: se formatean como UTC).
const horaCorta = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
export function etiquetaMinutos(min: number) {
  return horaCorta.format(new Date(Date.UTC(2000, 0, 1, 0, min)));
}

// null si la cita cabe en el horario (o el negocio no tiene horario configurado); si no, el
// motivo, listo para responder 400. La cita debe EMPEZAR después de abrir y TERMINAR antes de
// cerrar (inicio + duración del servicio).
export async function fueraDeHorario(
  db: ClienteTenant,
  tenantId: string,
  inicio: Date,
  duracionMin: number,
): Promise<string | null> {
  const dias = await db.horarioDia.findMany({ where: { tenantId } });
  if (dias.length === 0) return null;

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { zonaHoraria: true } });
  const { diaSemana, minutos } = enZona(inicio, tenant?.zonaHoraria ?? "America/Tijuana");
  const nombre = NOMBRE_DIA[diaSemana] ?? "ese día";
  const dia = dias.find((d) => d.diaSemana === diaSemana);
  if (!dia) {
    return `El negocio no abre los ${nombre}${nombre.endsWith("s") ? "" : "s"}`;
  }
  if (minutos < dia.abreMin || minutos + duracionMin > dia.cierraMin) {
    return `El ${nombre} el negocio abre de ${etiquetaMinutos(dia.abreMin)} a ${etiquetaMinutos(dia.cierraMin)}; la cita debe empezar y terminar dentro de ese horario`;
  }
  return null;
}
