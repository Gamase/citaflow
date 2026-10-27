import type { BadgeTone } from "../components/ui/Badge";

// Valores del enum EstadoCita del backend.
export type Estado = "PENDIENTE" | "CONFIRMADA" | "COMPLETADA" | "NO_ASISTIO" | "CANCELADA";

// Presentación de cada estado. La usan Citas (badges) y Resumen (badges y barras).
export const estados: Record<string, { label: string; tone: BadgeTone }> = {
  PENDIENTE: { label: "Pendiente", tone: "amber" },
  CONFIRMADA: { label: "Confirmada", tone: "teal" },
  COMPLETADA: { label: "Atendida", tone: "ink" },
  NO_ASISTIO: { label: "No asistió", tone: "danger" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
};
