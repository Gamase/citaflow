import { Router } from "express";
import { EstadoCita, Prisma } from "@prisma/client";
import { verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import { resumenSchema, ResumenInput } from "../schemas";

const router = Router();

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
  // "Hoy" del empleado: solo las citas que él atiende; el dueño ve las de todo el negocio.
  // No es un permiso (el empleado puede ver todas en Citas): es lo que a él le toca hoy.
  const hoySoloMias = req.rol === "EMPLEADO";

  const [hoy, proximas, porEstadoRaw, completadas, clientes, servicios, masPedidosRaw] = await Promise.all([
    req.db.appointment.findMany({
      where: {
        tenantId,
        fechaHora: { gte: hoyDesde, lt: hoyHasta },
        ...(hoySoloMias && { atiendeId: req.userId as string }),
      },
      select: CITA_CORTA,
      orderBy: { fechaHora: "asc" },
    }),
    // Próximas: a partir de mañana (las de hoy ya salen en `hoy`). "Mañana" lo dice el front
    // con su hora local: es el fin de su "hoy".
    req.db.appointment.findMany({
      where: {
        tenantId,
        fechaHora: { gte: hoyHasta },
        estado: { in: ["PENDIENTE", "CONFIRMADA"] },
      },
      select: CITA_CORTA,
      orderBy: { fechaHora: "asc" },
      take: 5,
    }),
    req.db.appointment.groupBy({ by: ["estado"], where: delMes, _count: { _all: true } }),
    // Los ingresos solo los ve el dueño: para el empleado ni se consultan.
    // Con el precio guardado en la cita (el de cuando se agendó).
    req.rol === "DUENO"
      ? req.db.appointment.findMany({
          where: { ...delMes, estado: "COMPLETADA" },
          select: { precio: true },
        })
      : null,
    req.db.client.count({ where: { tenantId } }),
    req.db.service.count({ where: { tenantId } }),
    // Servicios más pedidos del rango: por número de citas que no se cancelaron (una de
    // "No asistió" sí se pidió). Solo conteos, sin montos: también lo ve el empleado.
    req.db.appointment.groupBy({
      by: ["serviceId"],
      where: { ...delMes, estado: { not: "CANCELADA" } },
      _count: { _all: true },
      // Con empate, siempre el mismo orden (por id): el top no cambia entre una carga y otra.
      orderBy: [{ _count: { serviceId: "desc" } }, { serviceId: "asc" }],
      take: 5,
    }),
  ]);

  // Los nombres de esos servicios, en el mismo orden (del más pedido al menos).
  const nombres = await req.db.service.findMany({
    where: { tenantId, id: { in: masPedidosRaw.map((f) => f.serviceId) } },
    select: { id: true, nombre: true },
  });
  const serviciosMasPedidos = masPedidosRaw.flatMap((f) => {
    const s = nombres.find((n) => n.id === f.serviceId);
    return s ? [{ id: s.id, nombre: s.nombre, citas: f._count._all }] : [];
  });

  // Los 5 estados siempre presentes, en 0 si no hay citas.
  const porEstado = Object.fromEntries(Object.values(EstadoCita).map((e) => [e, 0])) as Record<EstadoCita, number>;
  for (const fila of porEstadoRaw) {
    porEstado[fila.estado] = fila._count._all;
  }

  // null cuando todavía no hay citas resueltas: el front muestra "—" en vez de dividir entre cero.
  const resueltas = porEstado.COMPLETADA + porEstado.NO_ASISTIO;
  const tasaNoAsistencia = resueltas === 0 ? null : porEstado.NO_ASISTIO / resueltas;

  const ingresos = completadas?.reduce((suma, c) => suma.plus(c.precio), new Prisma.Decimal(0));

  res.json({
    hoy,
    // Para que el front titule "Mis citas de hoy" según lo que de verdad se le mandó.
    hoySoloMias,
    proximas,
    mes: {
      porEstado,
      total: Object.values(porEstado).reduce((a, b) => a + b, 0),
      tasaNoAsistencia,
      // null para el empleado: no basta con ocultarlo en el front.
      ingresos: ingresos ? ingresos.toNumber() : null,
      serviciosMasPedidos,
    },
    totales: { clientes, servicios },
  });
});

export default router;
