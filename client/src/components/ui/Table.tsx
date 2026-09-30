// Tabla base: la tarjeta contenedora hace scroll horizontal propio en móvil,
// así la página nunca se desborda.

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-line bg-surface shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">{children}</table>
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
      className={`border-b border-line bg-canvas px-4 py-2.5 whitespace-nowrap text-xs font-medium tracking-wide text-muted uppercase ${
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
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line px-4 py-3 align-middle whitespace-nowrap ${align === "right" ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tr className={`transition-colors last:[&>td]:border-b-0 hover:bg-canvas ${className}`}>{children}</tr>;
}
