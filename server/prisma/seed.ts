import { EstadoCita, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

interface Dataset {
  tenants: {
    nombre: string;
    email: string;
    password: string;
    nombreUsuario: string;
    servicios: { nombre: string; duracionMin: number; precio: number }[];
    clientes: { nombre: string; telefono: string }[];
  }[];
}

const DATASETS: Record<string, Dataset> = {
  dev: {
    tenants: [
      {
        nombre: "Taller El Tornillo",
        email: "admin@tornillo.dev",
        password: "123456",
        nombreUsuario: "Dev Tester",
        servicios: [
          { nombre: "Afinación básica", duracionMin: 30, precio: 150 },
          { nombre: "Cambio de aceite", duracionMin: 20, precio: 100 },
        ],
        clientes: [
          { nombre: "Cliente Prueba Uno", telefono: "6640000001" },
          { nombre: "Cliente Prueba Dos", telefono: "6640000002" },
        ],
      },
      {
        nombre: "Consultorio Dr. Prueba",
        email: "admin@drprueba.dev",
        password: "123456",
        nombreUsuario: "Dev Tester 2",
        servicios: [{ nombre: "Consulta general", duracionMin: 30, precio: 200 }],
        clientes: [{ nombre: "Paciente Prueba", telefono: "6640000003" }],
      },
    ],
  },
  staging: {
    tenants: [
      {
        nombre: "Salón Bella Vista",
        email: "admin@bellavista.test",
        password: "123456",
        nombreUsuario: "Staging Tester",
        servicios: [
          { nombre: "Corte de dama", duracionMin: 45, precio: 250 },
          { nombre: "Manicure", duracionMin: 30, precio: 180 },
        ],
        clientes: [
          { nombre: "Laura Staging", telefono: "6641110001" },
          { nombre: "Carlos Staging", telefono: "6641110002" },
        ],
      },
      {
        nombre: "MotorPro Servicio",
        email: "admin@motorpro.test",
        password: "123456",
        nombreUsuario: "Staging Tester 2",
        servicios: [{ nombre: "Diagnóstico", duracionMin: 40, precio: 300 }],
        clientes: [{ nombre: "Cliente MotorPro", telefono: "6641110003" }],
      },
    ],
  },
  prod: {
    tenants: [
      {
        nombre: "Barbería El Corte",
        email: "admin@barberia.com",
        password: "123456",
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
      },
      {
        nombre: "Spa Relax",
        email: "admin@sparelax.com",
        password: "654321",
        nombreUsuario: "María López",
        servicios: [
          { nombre: "Masaje relajante", duracionMin: 60, precio: 500 },
          { nombre: "Facial hidratante", duracionMin: 45, precio: 400 },
        ],
        clientes: [
          { nombre: "Ana Torres", telefono: "6647654321" },
          { nombre: "Sofía Ramírez", telefono: "6647654322" },
        ],
      },
    ],
  },
};

// Fecha a N días de hoy, a la hora indicada en horario de Tijuana (UTC-7).
// Se fija la zona para que las citas caigan en horario laboral aunque el seed
// corra en un servidor en UTC (Render, EC2).
function fechaTijuana(dias: number, hora: number, minuto = 0): Date {
  const hoy = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const base = new Date(`${hoy}T00:00:00-07:00`);
  base.setUTCDate(base.getUTCDate() + dias);
  base.setUTCHours(hora + 7, minuto, 0, 0);
  return base;
}

// Una cita por estado. COMPLETADA y NO_ASISTIO siempre en el pasado (solo se
// permiten una vez que la cita empezó). La CONFIRMADA de ayer queda abierta para
// mostrar en la demo "Marcar atendida" / "No asistió". La CANCELADA y una PENDIENTE
// comparten horario a propósito: muestran que cancelar (o NO_ASISTIO) libera el espacio.
const CITAS_DEMO: { estado: EstadoCita; dias: number; hora: number }[] = [
  { estado: "COMPLETADA", dias: -2, hora: 10 },
  { estado: "NO_ASISTIO", dias: -1, hora: 12 },
  { estado: "CONFIRMADA", dias: -1, hora: 16 },
  { estado: "CANCELADA", dias: 1, hora: 10 },
  { estado: "PENDIENTE", dias: 1, hora: 10 },
  { estado: "PENDIENTE", dias: 1, hora: 16 },
  { estado: "CONFIRMADA", dias: 2, hora: 11 },
];

async function main() {
  const label = process.env.SEED_LABEL || "dev";
  const dataset = DATASETS[label];

  if (!dataset) {
    throw new Error(
      `SEED_LABEL="${label}" no reconocido. Usa uno de: ${Object.keys(DATASETS).join(", ")}`
    );
  }

  console.log(`Sembrando dataset "${label}"...`);
  console.log("Limpiando base de datos...");
  await prisma.appointment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  for (const t of dataset.tenants) {
    console.log(`Sembrando ${t.nombre}...`);
    const hashedPassword = await bcrypt.hash(t.password, 10);

    const tenant = await prisma.tenant.create({
      data: {
        nombre: t.nombre,
        users: {
          create: {
            email: t.email,
            password: hashedPassword,
            nombre: t.nombreUsuario,
          },
        },
        services: { create: t.servicios },
        clients: { create: t.clientes },
      },
      include: { services: true, clients: true },
    });

    const { services, clients } = tenant;
    if (services.length > 0 && clients.length > 0) {
      await prisma.appointment.createMany({
        data: CITAS_DEMO.map((c, i) => ({
          tenantId: tenant.id,
          clientId: clients[i % clients.length]!.id,
          serviceId: services[i % services.length]!.id,
          fechaHora: fechaTijuana(c.dias, c.hora),
          estado: c.estado,
        })),
      });
    }
  }

  console.log(`Listo. Dataset "${label}" sembrado:`);
  for (const t of dataset.tenants) {
    console.log(`  - ${t.nombre}: ${t.email} / ${t.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
