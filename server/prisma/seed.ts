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

  // bcrypt es lento a propósito: los hashes se calculan antes de abrir la transacción.
  const hashes = new Map<string, string>();
  for (const t of dataset.tenants) {
    hashes.set(t.email, await bcrypt.hash(t.password, 10));
    hashes.set(t.empleado.email, await bcrypt.hash(t.empleado.password, 10));
  }

  // Todo en UNA transacción: si algo falla a la mitad, la BD queda como estaba (no a medias).
  // Empieza con app.bypass_rls: el seed escribe en todos los negocios a la vez, y con RLS
  // activo las políticas lo dejan pasar solo con esa variable (ver migración de RLS). Es por
  // convención: ninguna ruta de la API la fija. Timeout amplio: contra Render tarda más que
  // los 5 s por defecto.
  const creados: { datos: Negocio; tenant: { id: string } }[] = [];
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      console.log(`Sembrando dataset "${label}"...`);
      console.log("Limpiando base de datos...");
      await tx.appointment.deleteMany();
      await tx.client.deleteMany();
      await tx.service.deleteMany();
      await tx.user.deleteMany();
      await tx.tenant.deleteMany();

        for (const t of dataset.tenants) {
        console.log(`Sembrando ${t.nombre}...`);
        const tenant = await tx.tenant.create({
          data: {
            nombre: t.nombre,
            users: {
              create: [
                {
                  email: t.email,
                  password: hashes.get(t.email)!,
                  nombre: t.nombreUsuario,
                  rol: "DUENO",
                },
                {
                  email: t.empleado.email,
                  password: hashes.get(t.empleado.email)!,
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
          services.push(await tx.service.create({ data: { ...s, tenantId: tenant.id } }));
        }
        const clients: { id: string }[] = [];
        for (const c of t.clientes) {
          clients.push(await tx.client.create({ data: { ...c, tenantId: tenant.id } }));
        }

        // Quién atiende cada cita: el dueño o el empleado recién creados (o nadie).
        const usuarios = await tx.user.findMany({ where: { tenantId: tenant.id } });
        const idDe = { dueno: usuarios.find((u) => u.rol === "DUENO")!.id, empleado: usuarios.find((u) => u.rol === "EMPLEADO")!.id };

        await tx.appointment.createMany({
          data: citasConFecha(t, ahora).map((c) => ({
            tenantId: tenant.id,
            clientId: clients[c.cliente]!.id,
            serviceId: services[c.servicio]!.id,
            fechaHora: c.fechaHora,
            estado: c.estado,
            // Como hace la API al agendar: el precio del servicio queda guardado en la cita.
            precio: t.servicios[c.servicio]!.precio,
            atiendeId: c.atiende ? idDe[c.atiende] : null,
          })),
        });

        creados.push({ datos: t, tenant });
      }
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

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
  // Otra transacción corta con bypass: lee citas de B sin estar "dentro" de ese negocio.
  const citaB = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.appointment.findFirst({
      where: { tenantId: b.tenant.id, estado: "CONFIRMADA", fechaHora: { gte: ahora } },
      orderBy: { fechaHora: "asc" },
      include: { client: true },
    });
  });
  if (citaB) {
    console.log(`  - Cita de ${b.datos.nombre} para el curl: ${citaB.id}`);
    console.log(`    (${citaB.client.nombre}, ${formatoTijuana.format(citaB.fechaHora)}, Confirmada)`);
  }

  // Horario ocupado en A: una cita activa sin asignar a la misma hora que una Cancelada
  // (sin asignar para que el 409 salga desde el formulario con "Sin asignar").
  const citasA = citasConFecha(a.datos, ahora);
  const activa = (c: (typeof citasA)[number]) => !["CANCELADA", "NO_ASISTIO"].includes(c.estado);
  const ocupada = citasA.find(
    (c) =>
      c.fechaHora > ahora &&
      activa(c) &&
      !c.atiende &&
      citasA.some((o) => o.estado === "CANCELADA" && o.fechaHora.getTime() === c.fechaHora.getTime()),
  );
  if (ocupada) {
    const servicio = a.datos.servicios[ocupada.servicio]!;
    console.log(
      `  - Horario ocupado en ${a.datos.nombre}: ${formatoTijuana.format(ocupada.fechaHora)} ` +
        `(${servicio.nombre}, ${servicio.duracionMin} min, ${a.datos.clientes[ocupada.cliente]!.nombre}). ` +
        `Agendar ahí "Sin asignar" → 409; a la misma hora hay una Cancelada que ya no ocupa.`,
    );
  }

  // Dos citas activas a la misma hora en A, de personas distintas: no chocan.
  const pareja = citasA.find(
    (c) =>
      c.fechaHora > ahora &&
      activa(c) &&
      c.atiende === "dueno" &&
      citasA.some((o) => o.atiende === "empleado" && activa(o) && o.fechaHora.getTime() === c.fechaHora.getTime()),
  );
  if (pareja) {
    console.log(
      `  - Misma hora, dos personas en ${a.datos.nombre}: ${formatoTijuana.format(pareja.fechaHora)} ` +
        `(una del dueño y otra de ${a.datos.empleado.nombre}). No chocan: cada persona tiene su agenda.`,
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
