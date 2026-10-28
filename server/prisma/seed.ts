import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { citasConFecha, DATASETS, validarNegocio, type Negocio } from "./seed-data";

const prisma = new PrismaClient();

const formatoTijuana = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Tijuana",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

async function main() {
  const label = process.env.SEED_LABEL || "dev";
  const dataset = DATASETS[label];

  if (!dataset) {
    throw new Error(
      `SEED_LABEL="${label}" no reconocido. Usa uno de: ${Object.keys(DATASETS).join(", ")}`
    );
  }

  // Una sola "hora de sembrado" para validar y crear: las fechas salen idénticas.
  const ahora = new Date();

  // Antes de borrar nada: si los datos rompen alguna regla de la API, no se toca la BD.
  const errores = dataset.tenants.flatMap((t) => validarNegocio(t, ahora));
  // El email es único en toda la BD (con él se hace login), no solo dentro de cada negocio.
  const emails = dataset.tenants.flatMap((t) => [t.email, t.empleado.email]);
  for (const repetido of new Set(emails.filter((e, i) => emails.indexOf(e) !== i))) {
    errores.push(`El email ${repetido} se repite (los emails son únicos en todo CitaFlow)`);
  }
  if (errores.length > 0) {
    throw new Error(`Los datos del seed "${label}" no cumplen las reglas:\n  - ${errores.join("\n  - ")}`);
  }

  console.log(`Sembrando dataset "${label}"...`);
  console.log("Limpiando base de datos...");
  await prisma.appointment.deleteMany();
  await prisma.client.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const creados: { datos: Negocio; tenant: { id: string } }[] = [];
  for (const t of dataset.tenants) {
    console.log(`Sembrando ${t.nombre}...`);
    const tenant = await prisma.tenant.create({
      data: {
        nombre: t.nombre,
        users: {
          create: [
            {
              email: t.email,
              password: await bcrypt.hash(t.password, 10),
              nombre: t.nombreUsuario,
              rol: "DUENO",
            },
            {
              email: t.empleado.email,
              password: await bcrypt.hash(t.empleado.password, 10),
              nombre: t.empleado.nombre,
              rol: "EMPLEADO",
            },
          ],
        },
      },
    });

    // Uno por uno (no createMany) para conservar el orden y poder usar los índices.
    const services: { id: string }[] = [];
    for (const s of t.servicios) {
      services.push(await prisma.service.create({ data: { ...s, tenantId: tenant.id } }));
    }
    const clients: { id: string }[] = [];
    for (const c of t.clientes) {
      clients.push(await prisma.client.create({ data: { ...c, tenantId: tenant.id } }));
    }

    await prisma.appointment.createMany({
      data: citasConFecha(t, ahora).map((c) => ({
        tenantId: tenant.id,
        clientId: clients[c.cliente]!.id,
        serviceId: services[c.servicio]!.id,
        fechaHora: c.fechaHora,
        estado: c.estado,
      })),
    });

    creados.push({ datos: t, tenant });
  }

  console.log(`Listo. Dataset "${label}" sembrado:`);
  for (const t of dataset.tenants) {
    console.log(`  - ${t.nombre}: ${t.email} / ${t.password} (dueño)`);
    console.log(`    ${" ".repeat(t.nombre.length)}  ${t.empleado.email} / ${t.empleado.password} (empleado: ${t.empleado.nombre})`);
  }

  await imprimirDatosDeDemo(creados, ahora);
}

// Datos que se necesitan en la demo, sacados de lo que se acaba de sembrar.
async function imprimirDatosDeDemo(
  creados: { datos: Negocio; tenant: { id: string } }[],
  ahora: Date,
) {
  const [a, b] = creados;
  if (!a || !b) return;

  console.log("\nPara la demo:");

  // Roles: el empleado de A agenda y atiende, pero no ve ingresos ni administra servicios ni equipo.
  console.log(
    `  - Empleado de ${a.datos.nombre}: ${a.datos.empleado.email} / ${a.datos.empleado.password} ` +
      `(${a.datos.empleado.nombre}). Sin ingresos en el Resumen, Servicios solo lectura, sin Equipo.`,
  );

  // Cita de B para el curl de acceso cruzado (con el token de A → 404).
  const citaB = await prisma.appointment.findFirst({
    where: { tenantId: b.tenant.id, estado: "CONFIRMADA", fechaHora: { gte: ahora } },
    orderBy: { fechaHora: "asc" },
    include: { client: true },
  });
  if (citaB) {
    console.log(`  - Cita de ${b.datos.nombre} para el curl: ${citaB.id}`);
    console.log(`    (${citaB.client.nombre}, ${formatoTijuana.format(citaB.fechaHora)}, Confirmada)`);
  }

  // Horario ocupado en A: una cita activa a la misma hora que una Cancelada.
  const citasA = citasConFecha(a.datos, ahora);
  const ocupada = citasA.find(
    (c) =>
      c.fechaHora > ahora &&
      !["CANCELADA", "NO_ASISTIO"].includes(c.estado) &&
      citasA.some((o) => o.estado === "CANCELADA" && o.fechaHora.getTime() === c.fechaHora.getTime()),
  );
  if (ocupada) {
    const servicio = a.datos.servicios[ocupada.servicio]!;
    console.log(
      `  - Horario ocupado en ${a.datos.nombre}: ${formatoTijuana.format(ocupada.fechaHora)} ` +
        `(${servicio.nombre}, ${servicio.duracionMin} min, ${a.datos.clientes[ocupada.cliente]!.nombre}). ` +
        `Agendar ahí → 409; a la misma hora hay una Cancelada que ya no ocupa.`,
    );
  }

  // Teléfono y nombre de servicio que se repiten entre A y B (unicidad por negocio).
  for (const c of a.datos.clientes) {
    const otro = b.datos.clientes.find((o) => o.telefono === c.telefono);
    if (otro) console.log(`  - Teléfono repetido ${c.telefono}: "${c.nombre}" (A) y "${otro.nombre}" (B)`);
  }
  for (const s of a.datos.servicios) {
    if (b.datos.servicios.some((o) => o.nombre === s.nombre)) {
      console.log(`  - Servicio repetido: "${s.nombre}" en A y en B`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
