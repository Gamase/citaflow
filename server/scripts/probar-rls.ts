// Prueba de Row-Level Security directo contra la BD (sin la API).
//
// Uso (desde server/):
//   DEV:      npx tsx scripts/probar-rls.ts                (toma DATABASE_URL de .env: citaflow_app)
//   Staging:  DATABASE_URL="<url de Render>?sslmode=require" npx tsx scripts/probar-rls.ts
//
// Necesita una BD sembrada (toma los dos primeros negocios). No deja datos: el único
// INSERT que intenta debe rechazarlo la política; si pasara, lo reporta y lo borra.
//
// Revisa:
//   0. Que el rol de la conexión NO sea superusuario ni tenga BYPASSRLS (a esos Postgres
//      nunca les aplica RLS, ni con FORCE: la prueba no valdría nada).
//   1. Con el cliente del negocio A, clients y appointments SIN where → solo filas de A.
//   2. Sin tenant fijado (prisma base) → 0 filas (falla cerrado).
//   3. Con el cliente de A, crear un cliente con el tenantId de B → error de la política.
//   4. Con el cliente de A, modificar un cliente de B sin where tenantId → 0 filas.

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usa DATABASE_URL del entorno.
}

const TABLAS = ["Service", "Client", "Appointment"];
const TELEFONO_PRUEBA = "5599990000";

async function main() {
  // Después de cargar .env: db.ts crea el PrismaClient al importarse.
  const { prisma, clienteDelTenant } = await import("../src/db");
  let fallas = 0;
  const linea = (ok: boolean | null, desc: string, detalle = "") => {
    if (ok === false) fallas++;
    console.log(`${ok === null ? "⏭️ " : ok ? "✅" : "❌"} ${desc.padEnd(46)} ${detalle}`);
  };

  // Con bypass: para saber cuántas filas hay en total y de quién (solo lectura).
  const conBypass = <T>(fn: (tx: typeof prisma) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return fn(tx as typeof prisma);
    });

  try {
    const host = new URL(process.env.DATABASE_URL ?? "").host;
    const [rol] = await prisma.$queryRaw<{ usuario: string; super: boolean; bypass: boolean }[]>`
      SELECT current_user AS usuario, rolsuper AS super, rolbypassrls AS bypass
      FROM pg_roles WHERE rolname = current_user`;
    console.log(`BD: ${host}  |  rol: ${rol!.usuario}\n`);

    // 0. El rol
    const rolValido = !rol!.super && !rol!.bypass;
    linea(
      rolValido,
      "rol sin superusuario ni BYPASSRLS",
      rolValido
        ? ""
        : `${rol!.usuario} es ${rol!.super ? "superusuario" : "BYPASSRLS"}: Postgres no le aplica RLS. En DEV usa citaflow_app (scripts/rol-app-dev.sql).`,
    );
    if (!rolValido) return fallas;

    const estado = await prisma.$queryRaw<{ tabla: string; rls: boolean; force: boolean }[]>`
      SELECT relname AS tabla, relrowsecurity AS rls, relforcerowsecurity AS force
      FROM pg_class WHERE relname IN (${TABLAS[0]}, ${TABLAS[1]}, ${TABLAS[2]}) AND relkind = 'r'`;
    const activo = estado.length === TABLAS.length && estado.every((t) => t.rls && t.force);
    linea(
      activo ? true : null,
      "RLS + FORCE en Service, Client, Appointment",
      activo ? "" : `RLS aún no activo: ${estado.map((t) => `${t.tabla} rls=${t.rls} force=${t.force}`).join(", ")}`,
    );

    const [a, b] = await prisma.tenant.findMany({ orderBy: { creadoEn: "asc" }, take: 2 });
    if (!a || !b) {
      console.log("\nLa BD necesita al menos dos negocios: corre el seed.");
      return fallas + 1;
    }
    console.log(`\nNegocio A: ${a.nombre}  |  Negocio B: ${b.nombre}\n`);
    if (!activo) {
      console.log("Sin RLS activo los casos de abajo no aplican (fase 1): se saltan.");
      return fallas;
    }

    const dbA = clienteDelTenant(a.id);

    // 1. Sin where: solo lo de A.
    for (const modelo of ["client", "appointment"] as const) {
      const filas: { tenantId: string }[] =
        modelo === "client" ? await dbA.client.findMany() : await dbA.appointment.findMany();
      const total = await conBypass((tx) => (modelo === "client" ? tx.client.count() : tx.appointment.count()));
      const deA = await conBypass((tx) =>
        modelo === "client"
          ? tx.client.count({ where: { tenantId: a.id } })
          : tx.appointment.count({ where: { tenantId: a.id } }),
      );
      const ok = filas.length === deA && filas.length > 0 && filas.every((f) => f.tenantId === a.id);
      linea(ok, `cliente de A: ${modelo}.findMany() sin where`, `ve ${filas.length} de ${total} (de A hay ${deA})`);
    }

    // 2. Sin tenant fijado: nada.
    const sinTenant = await prisma.client.findMany();
    const citasSinTenant = await prisma.appointment.count();
    linea(
      sinTenant.length === 0 && citasSinTenant === 0,
      "sin tenant: clients y appointments",
      `ve ${sinTenant.length} clientes y ${citasSinTenant} citas`,
    );

    // 3. Insertar en B desde A.
    try {
      const creado = await dbA.client.create({
        data: { nombre: "Prueba RLS (no debería existir)", telefono: TELEFONO_PRUEBA, tenantId: b.id },
      });
      linea(false, "cliente de A crea un cliente con tenantId de B", "¡se creó! Lo borro.");
      await conBypass((tx) => tx.client.delete({ where: { id: creado.id } }));
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      const esPolitica = /row-level security/i.test(mensaje);
      linea(esPolitica, "cliente de A crea un cliente con tenantId de B", esPolitica ? "rechazado por la política" : mensaje.slice(0, 120));
    }

    // 4. Modificar una fila de B desde A, sin filtrar por tenantId.
    const deB = await conBypass((tx) => tx.client.findFirst({ where: { tenantId: b.id } }));
    if (deB) {
      const { count } = await dbA.client.updateMany({ where: { id: deB.id }, data: { nombre: "Intruso" } });
      linea(count === 0, "cliente de A modifica un cliente de B por id", `${count} filas modificadas`);
    }

    return fallas;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((fallas) => {
    console.log(fallas === 0 ? "\nRLS: todo como se esperaba." : `\nRLS: ${fallas} caso(s) fallaron.`);
    process.exit(fallas === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
