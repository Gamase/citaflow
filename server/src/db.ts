import { PrismaClient } from "@prisma/client";

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
