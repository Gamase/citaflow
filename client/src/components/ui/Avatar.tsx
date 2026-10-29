// Círculo con las iniciales de una persona. El color sale del nombre (siempre el mismo para el
// mismo nombre) y se elige entre tonos de la paleta con contraste AA. Es decorativo: el nombre
// siempre va escrito al lado.

const TONOS = [
  "bg-teal-50 text-teal-800",
  "bg-amber-50 text-amber-800",
  "bg-subtle text-ink-800",
  "bg-ink-800 text-white",
  "bg-teal-700 text-white",
  "bg-ink-300 text-ink-950",
];

function tonoDe(nombre: string) {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS[h % TONOS.length];
}

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

const TAMANOS = { sm: "size-6 text-[10px]", md: "size-9 text-xs" };

export default function Avatar({ nombre, tamano = "md" }: { nombre: string; tamano?: keyof typeof TAMANOS }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${TAMANOS[tamano]} ${tonoDe(nombre)}`}
    >
      {iniciales(nombre)}
    </span>
  );
}
