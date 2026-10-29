import { useId, useRef } from "react";
import { hoyLocal } from "../lib/format";
import { Input } from "./ui/Field";

// Fecha + hora para agendar y reagendar, en lugar del datetime-local nativo (que sale en el
// idioma del navegador). El valor es el mismo texto que daba el datetime-local,
// "2026-10-30T13:30" en hora local, así que lo que se manda a la API no cambia.
//
// Horario fijo de 8:00 a 20:00 cada 30 min (horario por negocio: mejora futura). Si la fecha es
// hoy, las horas que ya pasaron se deshabilitan. Si la cita a reagendar está a una hora fuera
// de los chips (p. ej. 11:20), esa hora aparece como un chip más, marcado "actual".

const HORAS = Array.from({ length: 25 }, (_, i) => {
  const minutos = 8 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${minutos % 60 === 0 ? "00" : "30"}`;
});

const fechaLarga = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const horaCorta = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });

function dos(n: number) {
  return String(n).padStart(2, "0");
}

function etiquetaHora(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return horaCorta.format(new Date(2000, 0, 1, h, m));
}

interface Props {
  valor: string; // "YYYY-MM-DDTHH:mm" o incompleto ("YYYY-MM-DD" sin hora, "" sin nada)
  onChange: (valor: string) => void;
  // Hora que ya tenía la cita (al reagendar): se muestra aunque no haya chip para ella.
  horaActual?: string;
  // Fecha mínima del input ("YYYY-MM-DD").
  min?: string;
  autoFocus?: boolean;
}

export default function SelectorFechaHora({ valor, onChange, horaActual, min, autoFocus }: Props) {
  const idFecha = useId();
  const idHoras = useId();
  const grupo = useRef<HTMLDivElement>(null);
  const [fecha = "", hora = ""] = valor.split("T");

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
          Hora {!fecha && <span className="font-normal text-muted">· elige primero la fecha</span>}
        </span>
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
