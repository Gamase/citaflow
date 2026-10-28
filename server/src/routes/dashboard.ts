import { Router } from "express";
import { EstadoCita, Prisma, PrismaClient } from "@prisma/client";
import { verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import { resumenSchema, ResumenInput } from "../schemas";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

// Lo que se muestra de cada cita en las listas del resumen.
const CITA_CORTA = {
  id: true,
  fechaHora: true,
  estado: true,
  client: { select: { nombre: true } },
  service: { select: { nombre: true } },
} satisfies Prisma.AppointmentSelect;

router.get("/resumen", validar(resumenSchema, "query"), async (req, res) => {
  const { hoyDesde, hoyHasta, mesDesde, mesHasta } = res.locals.query as ResumenInput;
  const tenantId = req.tenantId as string;
  const delMes = { tenantId, fechaHora: { gte: mesDesde, lt: mesHasta } };

  const [hoy, proximas, porEstadoRaw, completadas, clientes, servicios] = await Promise.all([
    prisma.appointment.findMany({
      where: { tenantId, fechaHora: { gte: hoyDesde, lt: hoyHasta } },
      select: CITA_CORTA,
      orderBy: { fechaHora: "asc" },
    }),
    // "Ahora" es un instante, no depende de la zona horaria: lo puede poner el server.
    prisma.appointment.findMany({
      where: {
        tenantId,
        fechaHora: { gte: new Date() },
        estado: { in: ["PENDIENTE", "CONFIRMADA"] },
      },
      select: CITA_CORTA,
      orderBy: { fechaHora: "asc" },
      take: 5,
    }),
    prisma.appointment.groupBy({ by: ["estado"], where: delMes, _count: { _all: true } }),
    // Los ingresos solo los ve el dueño: para el empleado ni se consultan.
    // Limitación conocida: usa el precio actual del servicio, no el de cuando se atendió.
    req.rol === "DUENO"
      ? prisma.appointment.findMany({
          where: { ...delMes, estado: "COMPLETADA" },
          select: { service: { select: { precio: true } } },
        })
      : null,
    prisma.client.count({ where: { tenantId } }),
    prisma.service.count({ where: { tenantId } }),
  ]);

  // Los 5 estados siempre presentes, en 0 si no hay citas.
  const porEstado = Object.fromEntries(Object.values(EstadoCita).map((e) => [e, 0])) as Record<EstadoCita, number>;
  for (const fila of porEstadoRaw) {
    porEstado[fila.estado] = fila._count._all;
  }

  // null cuando todavía no hay citas resueltas: el front muestra "—" en vez de dividir entre cero.
  const resueltas = porEstado.COMPLETADA + porEstado.NO_ASISTIO;
  const tasaNoAsistencia = resueltas === 0 ? null : porEstado.NO_ASISTIO / resueltas;

  const ingresos = completadas?.reduce((suma, c) => suma.plus(c.service.precio), new Prisma.Decimal(0));

  res.json({
    hoy,
    proximas,
    mes: {
      porEstado,
      total: Object.values(porEstado).reduce((a, b) => a + b, 0),
      tasaNoAsistencia,
      // null para el empleado: no basta con ocultarlo en el front.
      ingresos: ingresos ? ingresos.toNumber() : null,
    },
    totales: { clientes, servicios },
  });
});

export default router;
