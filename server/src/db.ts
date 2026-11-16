import { Prisma, PrismaClient } from "@prisma/client";

// Un solo PrismaClient (un solo pool de conexiones) para toda la API.
// Se usa tal cual solo para Tenant y User, que no tienen RLS: el login busca por email
// antes de saber de qué negocio eres, y verificarToken busca al usuario del token.
export const prisma = new PrismaClient();

// Cliente "atado" a un negocio: cada operación corre en una transacción corta que primero
// fija app.tenant_id y luego hace la query. Con RLS activo (fase 2), Postgres solo deja ver
// y escribir filas de ese negocio en Service, Client y Appointment; sin RLS no cambia nada.
//
// - set_config(..., true): el valor es local a la transacción. Al terminar se borra, así
//   que no se queda pegado en la conexión del pool para la siguiente petición.
// - Es una segunda capa: las rutas siguen filtrando con `where: { tenantId }`.
//
// verificarToken lo crea por petición (req.db). $extends no abre conexiones nuevas: usa
// el mismo pool de `prisma`.
export function clienteDelTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, resultado] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return resultado;
        },
      },
    },
  });
}

export type ClienteTenant = ReturnType<typeof clienteDelTenant>;

// Varias escrituras del mismo negocio en UNA sola transacción (p. ej. reemplazar el horario de
// la semana: borrar e insertar, o nada). req.db abre una transacción corta por operación, así
// que no sirve para eso: aquí app.tenant_id se fija DENTRO de la transacción y aplica a todo lo
// que haga `fn`, y RLS solo deja tocar filas de ese negocio.
export function transaccionDelTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;
    return fn(tx);
  });
}

// Agendar, reagendar, reasignar (panel) y reservar en línea corren aquí: una transacción del
// negocio (con app.tenant_id fijado dentro, como transaccionDelTenant) que empieza tomando un
// candado de Postgres por negocio. Sin él, revisar el choque y guardar la cita son dos pasos
// sueltos: dos peticiones simultáneas pueden pasar las dos la revisión y quedar encimadas.
// Con él, las del mismo negocio pasan de una en una: la segunda espera (milisegundos) a que la
// primera termine y entonces sí ve su cita. El candado se suelta solo al terminar la
// transacción, con commit o con rollback.
//
// Dentro de `fn` se usa SOLO `tx`: pedir otra conexión (req.db) con el candado tomado puede
// dejar el pool atorado (todas las conexiones esperando el candado, y quien lo tiene esperando
// una conexión). El tiempo de espera es más amplio que el default por si hay fila.
export function conCandadoDelNegocio<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
      return fn(tx);
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
