import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CITAS_DEMO, DATASETS } from "./seed-data";

const prisma = new PrismaClient();

// Las citas del seed se calculan en la hora de Tijuana de forma explícita, sin depender
// de la zona del sistema: el seed corre en servidores en UTC (Render, EC2).
// Tijuana cambia de horario (UTC-7 en verano, UTC-8 en invierno): el desfase se pide a Intl.
const ZONA = "America/Tijuana";

// Desfase de Tijuana respecto a UTC, en minutos, en un instante dado (-420 o -480).
function desfaseTijuana(instante: Date): number {
  const nombre = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, timeZoneName: "longOffset" })
    .formatToParts(instante)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-07:00"
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nombre ?? "");
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Fecha a N días de hoy (el "hoy" de Tijuana), a la hora indicada en hora de Tijuana.
function fechaTijuana(dias: number, hora: number, minuto = 0): Date {
  const [y, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA })
    .format(new Date()) // "2026-10-27"
    .split("-")
    .map(Number);
  // La hora de Tijuana escrita "como si fuera UTC", menos el desfase de ese día = el instante real.
  const comoUtc = Date.UTC(y!, mes! - 1, dia! + dias, hora, minuto);
  return new Date(comoUtc - desfaseTijuana(new Date(comoUtc)) * 60000);
}

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
