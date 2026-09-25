import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Limpiando base de datos...");
  await prisma.appointment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  console.log("Sembrando Barbería El Corte...");
  const passwordBarberia = await bcrypt.hash("123456", 10);
  const barberia = await prisma.tenant.create({
    data: {
      nombre: "Barbería El Corte",
      users: {
        create: {
          email: "admin@barberia.com",
          password: passwordBarberia,
          nombre: "Juan Pérez",
        },
      },
      services: {
        create: [
          { nombre: "Corte de cabello", duracionMin: 30, precio: 150 },
          { nombre: "Arreglo de barba", duracionMin: 20, precio: 100 },
          { nombre: "Corte + barba", duracionMin: 45, precio: 220 },
        ],
      },
      clients: {
        create: [
          { nombre: "Pedro Pérez", telefono: "6641234567" },
          { nombre: "Luis Gómez", telefono: "6641234568" },
          { nombre: "Marco Sánchez", telefono: "6641234569" },
        ],
      },
    },
    include: { services: true, clients: true },
  });

  const [servicioCorte, servicioBarba, servicioComboBarberia] = barberia.services;
  const [clientePedro, clienteLuis, clienteMarco] = barberia.clients;

  if (!servicioCorte || !servicioBarba || !servicioComboBarberia || !clientePedro || !clienteLuis || !clienteMarco) {
    throw new Error("Faltaron datos al sembrar Barbería El Corte");
  }

  await prisma.appointment.create({
    data: {
      tenantId: barberia.id,
      clientId: clientePedro.id,
      serviceId: servicioCorte.id,
      fechaHora: new Date("2026-10-01T10:00:00.000Z"),
      estado: "PENDIENTE",
    },
  });

  await prisma.appointment.create({
    data: {
      tenantId: barberia.id,
      clientId: clienteLuis.id,
      serviceId: servicioComboBarberia.id,
      fechaHora: new Date("2026-10-01T14:00:00.000Z"),
      estado: "CONFIRMADA",
    },
  });

  await prisma.appointment.create({
    data: {
      tenantId: barberia.id,
      clientId: clienteMarco.id,
      serviceId: servicioBarba.id,
      fechaHora: new Date("2026-09-20T09:00:00.000Z"),
      estado: "CANCELADA",
    },
  });

  console.log("Sembrando Spa Relax...");
  const passwordSpa = await bcrypt.hash("654321", 10);
  const spa = await prisma.tenant.create({
    data: {
      nombre: "Spa Relax",
      users: {
        create: {
          email: "admin@sparelax.com",
          password: passwordSpa,
          nombre: "María López",
        },
      },
      services: {
        create: [
          { nombre: "Masaje relajante", duracionMin: 60, precio: 500 },
          { nombre: "Facial hidratante", duracionMin: 45, precio: 400 },
        ],
      },
      clients: {
        create: [
          { nombre: "Ana Torres", telefono: "6647654321" },
          { nombre: "Sofía Ramírez", telefono: "6647654322" },
        ],
      },
    },
    include: { services: true, clients: true },
  });

  const [servicioMasaje] = spa.services;
  const [clienteAna] = spa.clients;

  if (!servicioMasaje || !clienteAna) {
    throw new Error("Faltaron datos al sembrar Spa Relax");
  }

  await prisma.appointment.create({
    data: {
      tenantId: spa.id,
      clientId: clienteAna.id,
      serviceId: servicioMasaje.id,
      fechaHora: new Date("2026-10-02T11:00:00.000Z"),
      estado: "PENDIENTE",
    },
  });

  console.log("Listo. Dos negocios sembrados:");
  console.log("  - Barbería El Corte: admin@barberia.com / 123456");
  console.log("  - Spa Relax: admin@sparelax.com / 654321");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
