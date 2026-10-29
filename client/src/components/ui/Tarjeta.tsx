import { Link } from "react-router-dom";
import { Card } from "./Table";

// Tarjeta de un número con título y detalle (Resumen e historial del cliente). Con `icono`
// lleva un círculo de color; con `to` toda la tarjeta es un enlace (con elevación al pasar).

export type TonoTarjeta = "teal" | "amber" | "ink" | "danger";

const CIRCULO: Record<TonoTarjeta, string> = {
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-800",
  ink: "bg-subtle text-ink-800",
  danger: "bg-danger-50 text-danger",
};

interface TarjetaProps {
  titulo: string;
  valor: string;
  detalle: string;
  icono?: React.ReactNode;
  tono?: TonoTarjeta;
  to?: string;
  // Para el enlace: qué pasa al abrirlo (p. ej. "Ver las citas de hoy").
  ariaLabel?: string;
}

export default function Tarjeta({ titulo, valor, detalle, icono, tono = "teal", to, ariaLabel }: TarjetaProps) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{titulo}</p>
        {icono && (
          <span
            aria-hidden="true"
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${CIRCULO[tono]}`}
          >
            {icono}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums break-words sm:text-3xl xl:text-4xl">
        {valor}
      </p>
      <p className="mt-1.5 text-xs text-muted sm:text-sm">{detalle}</p>
    </>
  );

  if (!to) return <Card className="p-4 sm:p-5">{contenido}</Card>;

  return (
    <Link
      to={to}
      aria-label={ariaLabel ? `${titulo}: ${valor}. ${ariaLabel}` : undefined}
      className="block rounded-lg border border-line bg-surface p-4 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift motion-reduce:hover:translate-y-0 sm:p-5"
    >
      {contenido}
    </Link>
  );
}
