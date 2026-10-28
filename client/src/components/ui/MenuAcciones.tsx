import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ItemMenu {
  label: string;
  onSelect: () => void;
  tono?: "normal" | "muted" | "danger";
  disabled?: boolean;
}

const TONOS = {
  normal: "text-fg",
  muted: "text-muted",
  danger: "text-danger",
};

// Menú "⋯" con las acciones secundarias de una fila. Sin librerías:
// - `position: fixed` calculado desde el botón, para que no lo recorte el `overflow` de la
//   tabla/tarjeta; abre hacia arriba si no cabe abajo. Por eso se cierra al hacer scroll.
// - Teclado: al abrir enfoca la primera opción; ↑/↓, Inicio/Fin para moverse; Esc cierra y
//   regresa el foco al botón; Tab cierra y sigue el orden normal.
// - Clic fuera lo cierra.
export default function MenuAcciones({ etiqueta, items }: { etiqueta: string; items: ItemMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Posición: debajo del botón y alineado a su derecha; arriba si no cabe abajo.
  useLayoutEffect(() => {
    if (!abierto || !boton.current || !menu.current) return;
    const b = boton.current.getBoundingClientRect();
    const { offsetWidth: ancho, offsetHeight: alto } = menu.current;
    const abajo = b.bottom + 4 + alto <= window.innerHeight;
    setPos({
      top: abajo ? b.bottom + 4 : Math.max(8, b.top - 4 - alto),
      left: Math.min(Math.max(8, b.right - ancho), window.innerWidth - ancho - 8),
    });
  }, [abierto]);

  // Ya colocado (y visible): el foco va a la primera opción.
  useEffect(() => {
    if (abierto && pos) menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [abierto, pos]);

  function alternar() {
    setPos(null);
    setAbierto((a) => !a);
  }

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    const clicFuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", clicFuera);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", clicFuera);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  function cerrarYEnfocar() {
    setAbierto(false);
    boton.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const opciones = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const i = opciones.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (j: number) => opciones[(j + opciones.length) % opciones.length]?.focus();
    if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(opciones.length - 1);
    else if (e.key === "Escape") cerrarYEnfocar();
    else if (e.key === "Tab") setAbierto(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  if (items.length === 0) return null;

  return (
    <div ref={contenedor} className="inline-flex">
      <button
        ref={boton}
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={alternar}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-lg leading-none transition-colors ${
          abierto ? "bg-subtle text-fg" : "text-muted hover:bg-subtle hover:text-fg"
        }`}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {abierto && (
        <div
          ref={menu}
          role="menu"
          aria-label={etiqueta}
          onKeyDown={onKeyDown}
          // Primero se dibuja invisible para medirlo; luego se coloca.
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
          className="fixed z-50 min-w-44 rounded-lg border border-line bg-surface py-1 text-left shadow-pop"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setAbierto(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-2 text-left text-sm whitespace-nowrap hover:bg-subtle focus:bg-subtle focus:outline-none disabled:opacity-50 ${
                TONOS[item.tono ?? "normal"]
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
