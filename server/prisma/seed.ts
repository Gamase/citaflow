import { EstadoCita, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DATASETS } from "./seed-data";

const prisma = new PrismaClient();

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
