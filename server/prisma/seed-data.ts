// Negocios, cuentas y citas de prueba de cada entorno, más las funciones puras que los
// convierten en fechas y los validan. Lo usan el seed (prisma/seed.ts) y el script de
// pruebas (scripts/pruebas.sh). Importarlo no toca la BD.

import type { EstadoCita } from "@prisma/client";

export interface Servicio {
  nombre: string;
  duracionMin: number;
  precio: number;
}

export interface Cliente {
  nombre: string;
  telefono: string;
  email?: string;
}

// Una cita a `dias` de hoy, a `hora`:`minuto` en hora de Tijuana. `cliente` y `servicio`
// son índices en las listas del negocio.
export interface CitaSemilla {
  dias: number;
  hora: number;
  minuto?: number;
  estado: EstadoCita;
  cliente: number;
  servicio: number;
}

export interface Negocio {
  nombre: string;
  email: string;
  password: string;
  nombreUsuario: string;
  servicios: Servicio[];
  clientes: Cliente[];
  citas: CitaSemilla[];
}

export interface Dataset {
  tenants: Negocio[];
}

// --- Agendas de Dev y Staging ---
//
// Mismas reglas que la API: Atendida y No asistió solo en el pasado; Cancelada y No asistió
// liberan el horario. En un mismo día las citas empiezan con 2 h o más de separación
// (ningún servicio de estos datos dura más), salvo las parejas Cancelada + activa a la misma
// hora, que están a propósito. Todo cae entre -14 y +7 días (pruebas.sh revisa ±16).
//
// Agenda del negocio A. Lo que se luce en la demo:
// - Hoy: Atendidas a las 9:00 y 11:00, una Pendiente a las 13:00 y la Confirmada de las 18:00.
// - Ayer: una Pendiente sin resolver (se ven "Marcar atendida" / "No asistió").
// - Mañana 10:00: horario ocupado (Confirmada) junto a una Cancelada → el 409 por choque.
const AGENDA_A: CitaSemilla[] = [
  { dias: -14, hora: 10, estado: "COMPLETADA", cliente: 0, servicio: 1 },
  { dias: -13, hora: 12, estado: "COMPLETADA", cliente: 1, servicio: 0 },
  { dias: -12, hora: 16, estado: "NO_ASISTIO", cliente: 2, servicio: 4 },
  { dias: -11, hora: 10, estado: "CANCELADA", cliente: 3, servicio: 2 },
  { dias: -10, hora: 11, estado: "COMPLETADA", cliente: 4, servicio: 3 },
  { dias: -8, hora: 10, estado: "NO_ASISTIO", cliente: 6, servicio: 0 },
  { dias: -7, hora: 13, estado: "COMPLETADA", cliente: 7, servicio: 4 },
  { dias: -6, hora: 10, estado: "CANCELADA", cliente: 8, servicio: 1 },
  { dias: -5, hora: 12, estado: "COMPLETADA", cliente: 9, servicio: 2 },
  { dias: -4, hora: 16, estado: "COMPLETADA", cliente: 0, servicio: 0 },
  { dias: -3, hora: 11, estado: "NO_ASISTIO", cliente: 1, servicio: 3 },
  { dias: -2, hora: 10, estado: "COMPLETADA", cliente: 2, servicio: 1 },
  { dias: -1, hora: 12, estado: "PENDIENTE", cliente: 3, servicio: 4 },
  { dias: -1, hora: 16, estado: "CONFIRMADA", cliente: 4, servicio: 0 },
  { dias: 0, hora: 9, estado: "COMPLETADA", cliente: 5, servicio: 1 },
  { dias: 0, hora: 11, estado: "COMPLETADA", cliente: 6, servicio: 0 },
  { dias: 0, hora: 13, estado: "PENDIENTE", cliente: 7, servicio: 4 },
  { dias: 0, hora: 18, estado: "CONFIRMADA", cliente: 8, servicio: 1 },
  { dias: 1, hora: 10, estado: "CANCELADA", cliente: 9, servicio: 3 },
  { dias: 1, hora: 10, estado: "CONFIRMADA", cliente: 0, servicio: 3 },
  { dias: 1, hora: 16, estado: "PENDIENTE", cliente: 1, servicio: 1 },
  { dias: 2, hora: 12, estado: "CONFIRMADA", cliente: 2, servicio: 2 },
  { dias: 3, hora: 10, estado: "PENDIENTE", cliente: 3, servicio: 0 },
  { dias: 5, hora: 11, estado: "PENDIENTE", cliente: 4, servicio: 4 },
  { dias: 7, hora: 10, estado: "PENDIENTE", cliente: 6, servicio: 0 },
];

// Agenda del negocio B: distinta a la de A (otros conteos y otra tasa de no asistencia),
// para que en el Resumen se note que cada negocio ve solo lo suyo.
const AGENDA_B: CitaSemilla[] = [
  { dias: -14, hora: 11, estado: "COMPLETADA", cliente: 0, servicio: 0 },
  { dias: -13, hora: 15, estado: "NO_ASISTIO", cliente: 1, servicio: 2 },
  { dias: -12, hora: 10, estado: "COMPLETADA", cliente: 2, servicio: 1 },
  { dias: -10, hora: 12, estado: "COMPLETADA", cliente: 3, servicio: 3 },
  { dias: -9, hora: 16, estado: "CANCELADA", cliente: 4, servicio: 0 },
  { dias: -8, hora: 11, estado: "COMPLETADA", cliente: 5, servicio: 4 },
  { dias: -7, hora: 10, estado: "NO_ASISTIO", cliente: 6, servicio: 1 },
  { dias: -6, hora: 14, estado: "COMPLETADA", cliente: 7, servicio: 0 },
  { dias: -4, hora: 10, estado: "COMPLETADA", cliente: 8, servicio: 2 },
  { dias: -3, hora: 12, estado: "CANCELADA", cliente: 9, servicio: 3 },
  { dias: -2, hora: 15, estado: "COMPLETADA", cliente: 0, servicio: 4 },
  { dias: -1, hora: 14, estado: "PENDIENTE", cliente: 1, servicio: 0 },
  { dias: 0, hora: 9, estado: "COMPLETADA", cliente: 2, servicio: 0 },
  { dias: 0, hora: 11, estado: "COMPLETADA", cliente: 3, servicio: 2 },
  { dias: 0, hora: 13, estado: "PENDIENTE", cliente: 4, servicio: 1 },
  { dias: 0, hora: 18, estado: "CONFIRMADA", cliente: 5, servicio: 0 },
  { dias: 1, hora: 12, estado: "CONFIRMADA", cliente: 6, servicio: 3 },
  { dias: 2, hora: 10, estado: "PENDIENTE", cliente: 7, servicio: 1 },
  { dias: 3, hora: 16, estado: "CANCELADA", cliente: 8, servicio: 4 },
  { dias: 4, hora: 11, estado: "PENDIENTE", cliente: 9, servicio: 0 },
  { dias: 6, hora: 10, estado: "CONFIRMADA", cliente: 0, servicio: 2 },
];

// Agenda corta de Producción (la de siempre): una cita por estado, repartiendo clientes
// y servicios en orden.
function agendaBasica(nClientes: number, nServicios: number): CitaSemilla[] {
  const base: Pick<CitaSemilla, "dias" | "hora" | "estado">[] = [
    { estado: "COMPLETADA", dias: -2, hora: 10 },
    { estado: "NO_ASISTIO", dias: -1, hora: 12 },
    { estado: "CONFIRMADA", dias: -1, hora: 16 },
    { estado: "CONFIRMADA", dias: 0, hora: 18 },
    { estado: "CANCELADA", dias: 1, hora: 10 },
    { estado: "PENDIENTE", dias: 1, hora: 10 },
    { estado: "PENDIENTE", dias: 1, hora: 16 },
    { estado: "CONFIRMADA", dias: 2, hora: 11 },
  ];
  return base.map((c, i) => ({ ...c, cliente: i % nClientes, servicio: i % nServicios }));
}

// Teléfonos con patrón obviamente ficticio: 664 000 01xx (negocio A), 664 000 02xx (B).
// 6640000100 está en A y en B a propósito: la unicidad del teléfono es por negocio.
export const DATASETS: Record<string, Dataset> = {
  dev: {
    tenants: [
      {
        nombre: "Taller El Tornillo",
        email: "admin@tornillo.dev",
        password: "12345678",
        nombreUsuario: "Dev Tester",
        servicios: [
          { nombre: "Diagnóstico", duracionMin: 30, precio: 250 },
          { nombre: "Cambio de aceite", duracionMin: 30, precio: 450 },
          { nombre: "Afinación mayor", duracionMin: 120, precio: 1800 },
          { nombre: "Frenos (balatas)", duracionMin: 90, precio: 1200 },
          { nombre: "Alineación y balanceo", duracionMin: 60, precio: 600 },
        ],
        clientes: [
          { nombre: "Ramiro Tovar Quezada", telefono: "6640000100", email: "ramiro.tovar@ejemplo.com" },
          { nombre: "Elena Barragán Soto", telefono: "6640000101" },
          { nombre: "Joel Montaño Ruiz", telefono: "6640000102", email: "joel.montano@ejemplo.com" },
          { nombre: "Patricia Ledesma Ortiz", telefono: "6640000103" },
          { nombre: "Hugo Valdivia Peña", telefono: "6640000104", email: "hugo.valdivia@ejemplo.com" },
          { nombre: "Lorena Cázares Mejía", telefono: "6640000105" },
          { nombre: "Ignacio Bermúdez Lara", telefono: "6640000106" },
          { nombre: "Rocío Zamudio Islas", telefono: "6640000107", email: "rocio.zamudio@ejemplo.com" },
          { nombre: "Fermín Arreola Vidal", telefono: "6640000108" },
          { nombre: "Silvia Ochoa Carmona", telefono: "6640000109" },
        ],
        citas: AGENDA_A,
      },
      {
        nombre: "Consultorio Dr. Prueba",
        email: "admin@drprueba.dev",
        password: "12345678",
        nombreUsuario: "Dev Tester 2",
        servicios: [
          { nombre: "Consulta general", duracionMin: 30, precio: 400 },
          { nombre: "Diagnóstico", duracionMin: 45, precio: 600 },
          { nombre: "Certificado médico", duracionMin: 20, precio: 250 },
          { nombre: "Control de presión", duracionMin: 15, precio: 150 },
          { nombre: "Curación", duracionMin: 30, precio: 350 },
        ],
        clientes: [
          { nombre: "Mariana Ibarra Solís", telefono: "6640000100", email: "mariana.ibarra@ejemplo.com" },
          { nombre: "Tomás Echeverría Paz", telefono: "6640000201" },
          { nombre: "Adriana Villaseñor Rivas", telefono: "6640000202", email: "adriana.villasenor@ejemplo.com" },
          { nombre: "Gerardo Nava Olmos", telefono: "6640000203" },
          { nombre: "Beatriz Cordero Lugo", telefono: "6640000204", email: "beatriz.cordero@ejemplo.com" },
          { nombre: "Óscar Paredes Ulloa", telefono: "6640000205" },
          { nombre: "Carmen Robles Esquivel", telefono: "6640000206" },
          { nombre: "Julián Mora Benítez", telefono: "6640000207", email: "julian.mora@ejemplo.com" },
          { nombre: "Natalia Acosta Rangel", telefono: "6640000208" },
          { nombre: "Esteban Rivas Treviño", telefono: "6640000209" },
        ],
        citas: AGENDA_B,
      },
    ],
  },
  staging: {
    tenants: [
      {
        nombre: "Salón Bella Vista",
        email: "admin@bellavista.test",
        password: "12345678",
        nombreUsuario: "Staging Tester",
        servicios: [
          { nombre: "Corte de dama", duracionMin: 45, precio: 280 },
          { nombre: "Tinte completo", duracionMin: 120, precio: 950 },
          { nombre: "Manicure", duracionMin: 40, precio: 220 },
          { nombre: "Peinado de evento", duracionMin: 60, precio: 450 },
          { nombre: "Lavado", duracionMin: 20, precio: 120 },
        ],
        clientes: [
          { nombre: "Daniela Fuentes Arriaga", telefono: "6640000100", email: "daniela.fuentes@ejemplo.com" },
          { nombre: "Verónica Salgado Pineda", telefono: "6640000101" },
          { nombre: "Claudia Herrera Montes", telefono: "6640000102", email: "claudia.herrera@ejemplo.com" },
          { nombre: "Gabriela Cisneros Lira", telefono: "6640000103" },
          { nombre: "Fernanda Quiroz Avilés", telefono: "6640000104", email: "fernanda.quiroz@ejemplo.com" },
          { nombre: "Mónica Estrada Valle", telefono: "6640000105" },
          { nombre: "Alejandra Durán Rocha", telefono: "6640000106" },
          { nombre: "Paola Meléndez Cruz", telefono: "6640000107", email: "paola.melendez@ejemplo.com" },
          { nombre: "Isabel Tapia Sandoval", telefono: "6640000108" },
          { nombre: "Renata Gallardo Vega", telefono: "6640000109" },
        ],
        citas: AGENDA_A,
      },
      {
        nombre: "MotorPro Servicio",
        email: "admin@motorpro.test",
        password: "12345678",
        nombreUsuario: "Staging Tester 2",
        servicios: [
          { nombre: "Diagnóstico", duracionMin: 40, precio: 350 },
          { nombre: "Cambio de aceite", duracionMin: 30, precio: 480 },
          { nombre: "Lavado", duracionMin: 45, precio: 180 },
          { nombre: "Afinación", duracionMin: 90, precio: 1500 },
          { nombre: "Frenos", duracionMin: 90, precio: 1100 },
        ],
        clientes: [
          { nombre: "Arturo Medina Galindo", telefono: "6640000100", email: "arturo.medina@ejemplo.com" },
          { nombre: "Sergio Castañeda Ríos", telefono: "6640000201" },
          { nombre: "Rodrigo Villalobos Sáenz", telefono: "6640000202", email: "rodrigo.villalobos@ejemplo.com" },
          { nombre: "Mauricio Aguirre Pacheco", telefono: "6640000203" },
          { nombre: "Leticia Rosales Ponce", telefono: "6640000204", email: "leticia.rosales@ejemplo.com" },
          { nombre: "Javier Cuevas Luna", telefono: "6640000205" },
          { nombre: "Andrés Salazar Ortega", telefono: "6640000206" },
          { nombre: "Diana Carrillo Márquez", telefono: "6640000207", email: "diana.carrillo@ejemplo.com" },
          { nombre: "Raúl Espinoza Duarte", telefono: "6640000208" },
          { nombre: "Karla Serrano Beltrán", telefono: "6640000209" },
        ],
        citas: AGENDA_B,
      },
    ],
  },
  prod: {
    tenants: [
      {
        nombre: "Barbería El Corte",
        email: "admin@barberia.com",
        password: "12345678",
        nombreUsuario: "Juan Pérez",
        servicios: [
          { nombre: "Corte de cabello", duracionMin: 30, precio: 150 },
          { nombre: "Arreglo de barba", duracionMin: 20, precio: 100 },
          { nombre: "Corte + barba", duracionMin: 45, precio: 220 },
        ],
        clientes: [
          { nombre: "Pedro Pérez", telefono: "6641234567" },
          { nombre: "Luis Gómez", telefono: "6641234568" },
          { nombre: "Marco Sánchez", telefono: "6641234569" },
        ],
        citas: agendaBasica(3, 3),
      },
      {
        nombre: "Spa Relax",
        email: "admin@sparelax.com",
        password: "12345678",
        nombreUsuario: "María López",
        servicios: [
          { nombre: "Masaje relajante", duracionMin: 60, precio: 500 },
          { nombre: "Facial hidratante", duracionMin: 45, precio: 400 },
        ],
        clientes: [
          { nombre: "Ana Torres", telefono: "6647654321" },
          { nombre: "Sofía Ramírez", telefono: "6647654322" },
        ],
        citas: agendaBasica(2, 2),
      },
    ],
  },
};

// --- Fechas en hora de Tijuana ---
//
// Explícitas, sin depender de la zona del sistema: el seed corre en servidores en UTC
// (Render, EC2). Tijuana cambia de horario (UTC-7 en verano, UTC-8 en invierno).
const ZONA = "America/Tijuana";

// Desfase de Tijuana respecto a UTC, en minutos, en un instante dado (-420 o -480).
function desfaseTijuana(instante: Date): number {
  const nombre = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-07:00"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nombre ?? "");
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Fecha a N días de `ahora` (el "hoy" de Tijuana), a la hora indicada en hora de Tijuana.
export function fechaTijuana(dias: number, hora: number, minuto = 0, ahora = new Date()): Date {
  const [y, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA })
    .format(ahora) // "2026-10-27"
    .split("-")
    .map(Number);
  // La hora de Tijuana escrita "como si fuera UTC", menos el desfase de ese día = el instante real.
  const comoUtc = Date.UTC(y!, mes! - 1, dia! + dias, hora, minuto);
  return new Date(comoUtc - desfaseTijuana(new Date(comoUtc)) * 60000);
}

// --- Reglas (las mismas que aplica la API) ---

const SOLO_EN_EL_PASADO: EstadoCita[] = ["COMPLETADA", "NO_ASISTIO"];
const LIBERAN_HORARIO: EstadoCita[] = ["CANCELADA", "NO_ASISTIO"];

// Las citas del negocio con su fecha real. Una Atendida o No asistió que al sembrar
// todavía no ocurre (por ejemplo, la de hoy a las 11:00 si se siembra a las 10:00) se
// mueve a ayer a la misma hora: conserva su estado, así que los conteos no cambian.
export function citasConFecha(negocio: Negocio, ahora = new Date()) {
  return negocio.citas.map((c) => {
    let fechaHora = fechaTijuana(c.dias, c.hora, c.minuto, ahora);
    if (SOLO_EN_EL_PASADO.includes(c.estado) && fechaHora > ahora) {
      fechaHora = fechaTijuana(c.dias - 1, c.hora, c.minuto, ahora);
    }
    return { ...c, fechaHora };
  });
}

const hhmm = (c: CitaSemilla) => `${c.hora}:${String(c.minuto ?? 0).padStart(2, "0")}`;

// Revisa que los datos de un negocio cumplan las reglas de la API. Devuelve los errores
// (vacío si todo bien). El seed no toca la BD si hay alguno.
export function validarNegocio(negocio: Negocio, ahora = new Date()): string[] {
  const errores: string[] = [];
  const n = negocio.nombre;

  const telefonos = new Set<string>();
  for (const c of negocio.clientes) {
    if (!/^\d{10}$/.test(c.telefono)) errores.push(`${n}: teléfono de ${c.nombre} no tiene 10 dígitos`);
    if (telefonos.has(c.telefono)) errores.push(`${n}: teléfono ${c.telefono} repetido`);
    telefonos.add(c.telefono);
  }

  const nombres = new Set<string>();
  for (const s of negocio.servicios) {
    const clave = s.nombre.trim().toLowerCase();
    if (nombres.has(clave)) errores.push(`${n}: servicio "${s.nombre}" repetido`);
    nombres.add(clave);
    if (!Number.isInteger(s.duracionMin) || s.duracionMin < 1 || s.duracionMin > 1440) {
      errores.push(`${n}: duración de "${s.nombre}" fuera de 1–1440`);
    }
    if (s.precio < 0) errores.push(`${n}: precio de "${s.nombre}" negativo`);
  }

  const citas = citasConFecha(negocio, ahora);
  let indicesOk = true;
  for (const c of citas) {
    if (!negocio.clientes[c.cliente] || !negocio.servicios[c.servicio]) {
      errores.push(`${n}: cita del día ${c.dias} ${hhmm(c)} con cliente o servicio inexistente`);
      indicesOk = false;
    }
    // Solo la de "hoy" se puede mover a ayer; una de días futuros seguiría en el futuro.
    if (SOLO_EN_EL_PASADO.includes(c.estado) && c.fechaHora > ahora) {
      errores.push(`${n}: cita del día ${c.dias} ${hhmm(c)} marcada ${c.estado} todavía no ocurre`);
    }
  }
  if (!indicesOk) return errores;

  // Choques entre citas que ocupan horario.
  const activas = citas
    .filter((c) => !LIBERAN_HORARIO.includes(c.estado))
    .map((c) => {
      const inicio = c.fechaHora.getTime();
      return { c, inicio, fin: inicio + negocio.servicios[c.servicio]!.duracionMin * 60000 };
    })
    .sort((a, b) => a.inicio - b.inicio);
  for (let i = 1; i < activas.length; i++) {
    const anterior = activas[i - 1]!;
    const actual = activas[i]!;
    if (actual.inicio < anterior.fin) {
      errores.push(
        `${n}: choque entre la cita del día ${anterior.c.dias} ${hhmm(anterior.c)} y la del día ${actual.c.dias} ${hhmm(actual.c)}`,
      );
    }
  }

  return errores;
}
