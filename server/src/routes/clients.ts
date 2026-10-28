import { Router } from "express";
import { EstadoCita, PrismaClient, Prisma } from "@prisma/client";
import { soloDueno, verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import {
  busquedaClientesSchema,
  clienteSchema,
  idParamSchema,
  editarClienteSchema,
  BusquedaClientesInput,
  ClienteInput,
  EditarClienteInput,
} from "../schemas";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

// Si lo que se busca parece teléfono ("664 000-01"), también busca por teléfono
// con solo los dígitos; si trae letras, solo por nombre.
const PARECE_TELEFONO = /^[\d\s()+-]+$/;

router.get("/", validar(busquedaClientesSchema, "query"), async (req, res) => {
  const { q } = res.locals.query as BusquedaClientesInput;
  const digitos = q && PARECE_TELEFONO.test(q) ? q.replace(/\D/g, "") : "";

  const clients = await prisma.client.findMany({
    where: {
      tenantId: req.tenantId as string,
      ...(q && {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          ...(digitos ? [{ telefono: { contains: digitos } }] : []),
        ],
      }),
    },
  });
  res.json(clients);
});

// Historial: el cliente, sus citas (de la más reciente a la más vieja) y un resumen.
router.get("/:id/historial", validar(idParamSchema, "params"), async (req, res) => {
  const tenantId = req.tenantId as string;
  const dueno = req.rol === "DUENO";

  const client = await prisma.client.findFirst({ where: { id: req.params.id, tenantId } });
  if (!client) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  const [citas, proxima] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: client.id, tenantId },
      select: {
        id: true,
        fechaHora: true,
        estado: true,
        // El precio solo para el dueño: con él el empleado podría sacar el total gastado.
        service: { select: { nombre: true, precio: dueno } },
      },
      orderBy: { fechaHora: "desc" },
    }),
    // "Ahora" es un instante, no depende de la zona horaria: lo puede poner el server.
    prisma.appointment.findFirst({
      where: { clientId: client.id, tenantId, fechaHora: { gte: new Date() }, estado: { in: ["PENDIENTE", "CONFIRMADA"] } },
      select: { id: true, fechaHora: true, estado: true, service: { select: { nombre: true } } },
      orderBy: { fechaHora: "asc" },
    }),
  ]);

  // Los 5 estados siempre presentes, en 0 si no hay citas.
  const porEstado = Object.fromEntries(Object.values(EstadoCita).map((e) => [e, 0])) as Record<EstadoCita, number>;
  for (const c of citas) porEstado[c.estado]++;

  // Igual que en el Resumen: precio actual del servicio, y null para el empleado.
  const totalGastado = dueno
    ? citas
        .filter((c) => c.estado === "COMPLETADA")
        .reduce((suma, c) => suma.plus(c.service.precio ?? 0), new Prisma.Decimal(0))
        .toNumber()
    : null;

  res.json({
    cliente: client,
    citas: citas.map(({ service, ...c }) => ({ ...c, service: { nombre: service.nombre } })),
    resumen: { total: citas.length, porEstado, proxima, totalGastado },
  });
});

router.post("/", validar(clienteSchema), async (req, res) => {
  const { nombre, telefono, email } = req.body as ClienteInput;

  try {
    const client = await prisma.client.create({
      data: { nombre, telefono, email, tenantId: req.tenantId as string },
    });
    res.status(201).json(client);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un cliente con ese teléfono" });
    }
    throw err;
  }
});

// Campos opcionales: solo se valida y actualiza lo que venga.
router.patch("/:id", validar(editarClienteSchema), async (req, res) => {
  const { nombre, telefono, email } = req.body as EditarClienteInput;

  const client = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!client) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  try {
    const actualizado = await prisma.client.update({
      where: { id: client.id, tenantId: req.tenantId as string },
      data: { nombre, telefono, email },
    });
    res.json(actualizado);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un cliente con ese teléfono" });
    }
    throw err;
  }
});

// Borrar un cliente es solo del dueño; el empleado puede verlos, crearlos y editarlos.
router.delete("/:id", soloDueno, async (req, res) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!client) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }

  const citasLigadas = await prisma.appointment.count({
    where: { clientId: client.id, tenantId: req.tenantId as string },
  });

  if (citasLigadas > 0) {
    return res.status(409).json({ error: "No se puede eliminar: tiene citas asociadas" });
  }

  await prisma.client.delete({ where: { id: client.id, tenantId: req.tenantId as string } });
  res.status(204).send();
});

export default router;
