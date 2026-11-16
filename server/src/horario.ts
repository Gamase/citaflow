import type { Prisma } from "@prisma/client";

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

// Minutos que esa zona lleva de diferencia con UTC en ese instante (Tijuana: -480 o -420).
function desfaseMin(instante: Date, zona: string): number {
  const nombre = new Intl.DateTimeFormat("en-US", { timeZone: zona, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-08:00"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nombre ?? "");
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// El instante en que, en esa zona, el día `fecha` ("AAAA-MM-DD") marca `minutos` desde
// medianoche. Lo contrario de enZona. Dos pasadas porque el desfase depende del instante: la
// segunda corrige los días en que cambia el horario de verano.
export function instanteEnZona(fecha: string, minutos: number, zona: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const comoUtc = Date.UTC(y!, m! - 1, d!, 0, minutos);
  const aprox = comoUtc - desfaseMin(new Date(comoUtc), zona) * 60000;
  return new Date(comoUtc - desfaseMin(new Date(aprox), zona) * 60000);
}

// Día de la semana (0 = domingo) de una fecha "AAAA-MM-DD". No depende de ninguna zona.
export function diaSemanaDe(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export interface TramoDia {
  diaSemana: number;
  abreMin: number;
  cierraMin: number;
}

// null si la cita cabe en el horario; si no, el motivo, listo para responder 400. La cita debe
// EMPEZAR después de abrir y TERMINAR antes de cerrar (inicio + duración del servicio).
// `dias` vacío = el negocio no configuró horario: no hay restricción.
export function motivoFueraDeHorario(dias: TramoDia[], zona: string, inicio: Date, duracionMin: number): string | null {
  if (dias.length === 0) return null;
  const { diaSemana, minutos } = enZona(inicio, zona);
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

// Lo mismo, consultando el horario y la zona del negocio. Recibe el `tx` de
// conCandadoDelNegocio (db.ts): se revisa en la misma transacción en que se guarda la cita.
export async function fueraDeHorario(
  tx: Prisma.TransactionClient,
  tenantId: string,
  inicio: Date,
  duracionMin: number,
): Promise<string | null> {
  const dias = await tx.horarioDia.findMany({ where: { tenantId } });
  if (dias.length === 0) return null;
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { zonaHoraria: true } });
  return motivoFueraDeHorario(dias, tenant?.zonaHoraria ?? "America/Tijuana", inicio, duracionMin);
}
