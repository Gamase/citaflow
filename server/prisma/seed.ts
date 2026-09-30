import { PrismaClient } from "@prisma/client";
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

    const [primerServicio] = tenant.services;
    const [primerCliente] = tenant.clients;

    if (primerServicio && primerCliente) {
      await prisma.appointment.create({
        data: {
          tenantId: tenant.id,
          clientId: primerCliente.id,
          serviceId: primerServicio.id,
          fechaHora: new Date(Date.now() + 24 * 60 * 60 * 1000),
          estado: "PENDIENTE",
        },
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
