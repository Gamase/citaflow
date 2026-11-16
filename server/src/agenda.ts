import type { EstadoCita, Prisma } from "@prisma/client";

// Reglas de la agenda que comparten el panel (routes/appointments.ts) y la página pública de
// reservas (routes/public.ts).

// Estados que ya no ocupan su horario: se puede agendar otra cita encima.
export const LIBERAN_HORARIO: EstadoCita[] = ["CANCELADA", "NO_ASISTIO"];

export function sumarMinutos(fecha: Date, minutos: number) {
  return new Date(fecha.getTime() + minutos * 60000);
}

// ¿[inicioA, finA) y [inicioB, finB) se enciman? (Si una termina justo cuando empieza la otra, no.)
export function seEnciman(inicioA: Date, finA: Date, inicioB: Date, finB: Date) {
  return inicioA < finB && finA > inicioB;
}

// ¿El horario [inicio, inicio + duración) choca con alguna cita activa de la misma agenda?
// Cada persona tiene su propia agenda y "Sin asignar" (atiendeId null) es una agenda más:
// solo chocan citas de la misma persona, o dos sin asignar.
// Se revisan todas las que empiezan antes de que termine la nueva (ventana de 24 h
// hacia atrás: ningún servicio dura más que eso). `excluirId` deja fuera a la propia
// cita al reagendarla o reasignarla, para que no choque consigo misma.
//
// Recibe el `tx` de conCandadoDelNegocio (db.ts): revisar el choque y guardar la cita van en la
// misma transacción con el candado del negocio tomado; si no, dos peticiones simultáneas
// podrían pasar las dos esta revisión.
export async function hayChoque(
  tx: Prisma.TransactionClient,
  tenantId: string,
  inicio: Date,
  duracionMin: number,
  atiendeId: string | null,
  excluirId?: string,
) {
  const fin = sumarMinutos(inicio, duracionMin);

  const candidatas = await tx.appointment.findMany({
    where: {
      tenantId,
      atiendeId,
      id: excluirId ? { not: excluirId } : undefined,
      estado: { notIn: LIBERAN_HORARIO },
      fechaHora: {
        lt: fin,
        gte: sumarMinutos(inicio, -24 * 60),
      },
    },
    include: { service: true },
  });

  return candidatas.some((c) => seEnciman(inicio, fin, c.fechaHora, sumarMinutos(c.fechaHora, c.service.duracionMin)));
}
