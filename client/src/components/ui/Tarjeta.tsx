import { Card } from "./Table";

// Tarjeta de un número con título y detalle (Resumen e historial del cliente).
export default function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-fg tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted">{detalle}</p>
    </Card>
  );
}
