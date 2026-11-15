// Horario de apertura del negocio (GET /tenant/horario). Minutos desde medianoche, de 30 en 30,
// en la zona del negocio. Un día que no aparece está cerrado; lista vacía = sin horario.

export interface HorarioDia {
  diaSemana: number; // 0 = domingo … 6 = sábado
  abreMin: number;
  cierraMin: number;
}

export const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// En el orden en que se muestran (la semana empieza en lunes).
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

// Opciones de hora: de 00:00 (0) a 24:00 (1440), cada 30 min.
export const OPCIONES_MIN = Array.from({ length: 49 }, (_, i) => i * 30);

// Los minutos no dependen de ninguna zona: se formatean como UTC. 1440 es el cierre a medianoche.
const horaCorta = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export function etiquetaMinutos(min: number) {
  return min === 1440 ? "12:00 a.m. (medianoche)" : horaCorta.format(new Date(Date.UTC(2000, 0, 1, 0, min)));
}
