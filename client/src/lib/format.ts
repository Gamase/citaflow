// Formato de presentación. No valida ni transforma lo que se manda al backend.

const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function formatPrecio(valor: string | number) {
  const n = Number(valor);
  return Number.isFinite(n) ? moneda.format(n) : String(valor);
}

/** 5512345678 → 55 1234 5678 */
export function formatTelefono(tel: string) {
  return /^\d{10}$/.test(tel) ? `${tel.slice(0, 2)} ${tel.slice(2, 6)} ${tel.slice(6)}` : tel;
}

const fecha = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" });
const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

export function formatFecha(iso: string) {
  return fecha.format(new Date(iso));
}

export function formatHora(iso: string) {
  return hora.format(new Date(iso));
}
