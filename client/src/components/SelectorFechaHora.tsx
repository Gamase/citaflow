import { useId, useRef } from "react";
import { hoyLocal } from "../lib/format";
import { etiquetaMinutos, type HorarioDia } from "../lib/horario";
import { Input } from "./ui/Field";

// Fecha + hora para agendar y reagendar, en lugar del datetime-local nativo (que sale en el
// idioma del navegador). El valor es el mismo texto que daba el datetime-local,
// "2026-10-30T13:30" en hora local, así que lo que se manda a la API no cambia.
//
// Las horas salen del horario de apertura del negocio para el día elegido: de la apertura a la
// última hora en que el servicio todavía termina antes del cierre. Un día cerrado no ofrece
// horas. Sin horario configurado, de 8:00 a 20:00. Si la fecha es hoy, las horas que ya pasaron
// se deshabilitan. Si la cita a reagendar está a una hora fuera de los chips (p. ej. 11:20), esa
// hora aparece como un chip más, marcado "actual".
//
// El día de la semana se toma del navegador: se asume que quien agenda está en la zona del
// negocio (la misma suposición que "hoy" en el Resumen). El backend es quien valida de verdad.

const SIN_HORARIO = { abreMin: 8 * 60, cierraMin: 20 * 60 };

const fechaLarga = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function dos(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(min: number) {
  return `${dos(Math.floor(min / 60))}:${dos(min % 60)}`;
}

// Horas de inicio posibles, cada 30 min, en las que una cita de `duracionMin` termina antes del cierre.
function horasDe(tramo: { abreMin: number; cierraMin: number }, duracionMin: number) {
  const lista: string[] = [];
  for (let m = tramo.abreMin; m + Math.max(duracionMin, 30) <= tramo.cierraMin; m += 30) lista.push(hhmm(m));
  return lista;
}

function etiquetaHora(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return etiquetaMinutos(hh! * 60 + mm!);
}

interface Props {
  valor: string; // "YYYY-MM-DDTHH:mm" o incompleto ("YYYY-MM-DD" sin hora, "" sin nada)
  onChange: (valor: string) => void;
  // Horario del negocio; sin él (o vacío) se ofrecen de 8:00 a 20:00.
  horario?: HorarioDia[];
  // Duración del servicio elegido, para no ofrecer horas en que no alcanzaría a terminar.
  duracionMin?: number;
  // Hora que ya tenía la cita (al reagendar): se muestra aunque no haya chip para ella.
  horaActual?: string;
  // Fecha mínima del input ("YYYY-MM-DD").
  min?: string;
  autoFocus?: boolean;
}

export default function SelectorFechaHora({ valor, onChange, horario, duracionMin, horaActual, min, autoFocus }: Props) {
  const idFecha = useId();
  const idHoras = useId();
  const grupo = useRef<HTMLDivElement>(null);
  const [fecha = "", hora = ""] = valor.split("T");

  const conHorario = !!horario && horario.length > 0;
  const diaSemana = fecha ? new Date(`${fecha}T00:00`).getDay() : null;
  const tramo = !fecha || !conHorario ? SIN_HORARIO : horario.find((d) => d.diaSemana === diaSemana);
  const cerrado = fecha !== "" && !tramo;
  const HORAS = tramo ? horasDe(tramo, duracionMin ?? 30) : [];

  const horas = horaActual && !HORAS.includes(horaActual) ? [...HORAS, horaActual].sort() : HORAS;
  const esHoy = fecha === hoyLocal();
  const ahora = new Date();
  const ahoraHHMM = `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;
  const pasada = (h: string) => esHoy && h <= ahoraHHMM;

  const fechaTexto = fecha ? fechaLarga.format(new Date(`${fecha}T00:00`)) : null;

  function elegirHora(h: string) {
    onChange(`${fecha}T${h}`);
  }

  // Radiogroup: flechas, Inicio y Fin mueven el foco y eligen (saltando las horas pasadas).
  function onKeyDown(e: React.KeyboardEvent) {
    const habilitadas = horas.filter((h) => !pasada(h));
    const i = habilitadas.indexOf(hora);
    const destino =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? habilitadas[Math.min(i + 1, habilitadas.length - 1)]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? habilitadas[Math.max(i - 1, 0)]
          : e.key === "Home"
            ? habilitadas[0]
            : e.key === "End"
              ? habilitadas[habilitadas.length - 1]
              : undefined;
    if (!destino) return;
    e.preventDefault();
    elegirHora(destino);
    grupo.current?.querySelector<HTMLButtonElement>(`[data-hora="${destino}"]`)?.focus();
  }

  // El chip que recibe el Tab: el elegido o, si no hay, la primera hora disponible.
  const enfocable = hora && horas.includes(hora) && !pasada(hora) ? hora : horas.find((h) => !pasada(h));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFecha} className="text-sm font-medium text-fg">
          Fecha
        </label>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Input
            id={idFecha}
            type="date"
            lang="es-MX"
            className="sm:w-56"
            min={min}
            value={fecha}
            onChange={(e) => onChange(e.target.value ? `${e.target.value}${hora ? `T${hora}` : ""}` : "")}
            autoFocus={autoFocus}
            required
          />
          {fechaTexto && <span className="text-sm text-muted first-letter:uppercase">{fechaTexto}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={idHoras} className="text-sm font-medium text-fg">
          Hora{" "}
          {!fecha ? (
            <span className="font-normal text-muted">· elige primero la fecha</span>
          ) : conHorario && tramo ? (
            <span className="font-normal text-muted">
              · ese día abre de {etiquetaMinutos(tramo.abreMin)} a {etiquetaMinutos(tramo.cierraMin)}
            </span>
          ) : null}
        </span>
        {cerrado && (
          <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            El negocio está cerrado ese día. Elige otra fecha.
          </p>
        )}
        <div
          ref={grupo}
          role="radiogroup"
          aria-labelledby={idHoras}
          onKeyDown={onKeyDown}
          className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9"
        >
          {horas.map((h) => {
            const elegida = h === hora;
            const deshabilitada = !fecha || pasada(h);
            const esActual = h === horaActual && !HORAS.includes(h);
            return (
              <button
                key={h}
                type="button"
                role="radio"
                data-hora={h}
                aria-checked={elegida}
                disabled={deshabilitada}
                tabIndex={h === enfocable ? 0 : -1}
                onClick={() => elegirHora(h)}
                className={`flex min-h-9 flex-col items-center justify-center rounded-md border px-2 py-1 text-sm leading-tight tabular-nums transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-faint disabled:line-through ${
                  elegida
                    ? "border-teal-700 bg-teal-700 font-medium text-white"
                    : "border-line-strong bg-surface text-fg hover:border-teal-500 hover:bg-teal-50"
                }`}
              >
                {etiquetaHora(h)}
                {esActual && <span className="sr-only"> (hora actual de la cita)</span>}
                {esActual && <span className="text-[10px] font-normal opacity-80">actual</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
