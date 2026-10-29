// Tabla base. En escritorio (md, 768 px o más) es una tabla normal; en pantallas chicas cada
// fila se vuelve una tarjeta y cada celda una línea "Etiqueta  valor" (la etiqueta sale de
// `label`, porque el encabezado de la tabla se oculta). Una sola versión del contenido: las
// acciones y la edición en la fila funcionan igual en las dos.

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-line bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm max-md:block max-md:bg-canvas max-md:p-3 md:min-w-[640px] [&_tbody]:max-md:contents [&_thead]:max-md:hidden">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-line bg-canvas px-4 py-3 whitespace-nowrap text-xs font-medium tracking-wide text-muted uppercase ${
        align === "right" ? "text-right" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  label,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  // Etiqueta de la celda en móvil (ahí no se ve el encabezado). Sin ella, la celda ocupa todo el ancho.
  label?: string;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      data-label={label}
      colSpan={colSpan}
      className={`border-b border-line px-4 py-3.5 align-middle whitespace-nowrap max-md:flex max-md:min-w-0 max-md:items-center max-md:gap-3 max-md:border-0 max-md:px-0 max-md:py-1 max-md:whitespace-normal max-md:break-words ${
        label
          ? "max-md:before:w-24 max-md:before:shrink-0 max-md:before:text-xs max-md:before:text-muted max-md:before:content-[attr(data-label)]"
          : ""
      } ${align === "right" ? (label ? "text-right max-md:text-left" : "text-right max-md:justify-end max-md:pt-3") : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <tr
      className={`transition-colors last:[&>td]:border-b-0 hover:bg-canvas max-md:mb-3 max-md:flex max-md:flex-col max-md:rounded-lg max-md:last:mb-0 max-md:border max-md:border-line max-md:bg-surface max-md:p-4 max-md:shadow-card max-md:hover:bg-surface ${className}`}
    >
      {children}
    </tr>
  );
}
