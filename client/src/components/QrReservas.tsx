import qrcode from "qrcode-generator";
import Button from "./ui/Button";

// Código QR del enlace público de reservas, generado en el navegador (sin servicios externos).
// qrcode-generator solo calcula la matriz (qué módulos van oscuros, con su corrección de
// errores); aquí se dibuja: un SVG para verlo en la pantalla y un canvas para el PNG.
//
// Corrección de errores M (~15 %: sigue leyéndose aunque el impreso se raye un poco) y el
// margen blanco de 4 módulos que pide el estándar para que los lectores lo encuentren.

const MARGEN = 4;
// El PNG mide al menos esto por lado: buena resolución para imprimirlo.
const LADO_PNG = 1024;

function matriz(texto: string) {
  const qr = qrcode(0, "M"); // 0 = el tamaño más chico en que cabe el texto
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  return { n, oscuro: (fila: number, col: number) => qr.isDark(fila, col) };
}

// Un solo <path> con un cuadrito por módulo oscuro, en coordenadas de módulos (se escala solo).
function trazo(texto: string) {
  const { n, oscuro } = matriz(texto);
  let d = "";
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (oscuro(f, c)) d += `M${c + MARGEN} ${f + MARGEN}h1v1h-1z`;
    }
  }
  return { lado: n + 2 * MARGEN, d };
}

// PNG: cada módulo mide un número entero de pixeles (bordes nítidos), y en total ≥ 1024 px.
function descargarPng(texto: string, archivo: string) {
  const { n, oscuro } = matriz(texto);
  const lado = n + 2 * MARGEN;
  const px = Math.ceil(LADO_PNG / lado);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = lado * px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (oscuro(f, c)) ctx.fillRect((c + MARGEN) * px, (f + MARGEN) * px, px, px);
    }
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export default function QrReservas({ enlace, slug }: { enlace: string; slug: string }) {
  const { lado, d } = trazo(enlace);
  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        role="img"
        aria-label={`Código QR del enlace de reservas: ${enlace}`}
        viewBox={`0 0 ${lado} ${lado}`}
        className="size-40 rounded-md border border-line bg-white"
        shapeRendering="crispEdges"
      >
        <rect width={lado} height={lado} fill="#ffffff" />
        <path d={d} fill="#000000" />
      </svg>
      <Button variant="secondary" size="sm" onClick={() => descargarPng(enlace, `qr-reservas-${slug}.png`)}>
        Descargar QR
      </Button>
    </div>
  );
}
