import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { soloDueno, verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import { editarServicioSchema, servicioSchema, EditarServicioInput, ServicioInput } from "../schemas";

const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

// Ver servicios: todos (el empleado los necesita para agendar). Crear, editar y borrar: solo el dueño.

router.get("/", async (req, res) => {
  const services = await prisma.service.findMany({
    where: { tenantId: req.tenantId as string },
  });
  res.json(services);
});

router.post("/", soloDueno, validar(servicioSchema), async (req, res) => {
  const { nombre, duracionMin, precio } = req.body as ServicioInput;

  const existente = await prisma.service.findFirst({
    where: {
      tenantId: req.tenantId as string,
      nombre: { equals: nombre, mode: "insensitive" },
    },
  });

  if (existente) {
    return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
  }

  try {
    const service = await prisma.service.create({
      data: { nombre, duracionMin, precio, tenantId: req.tenantId as string },
    });
    res.status(201).json(service);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
    }
    throw err;
  }
});

// Campos opcionales: solo se valida y actualiza lo que venga.
router.patch("/:id", soloDueno, validar(editarServicioSchema), async (req, res) => {
  const { nombre, duracionMin, precio } = req.body as EditarServicioInput;

  const service = await prisma.service.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }

  if (nombre !== undefined) {
    const duplicado = await prisma.service.findFirst({
      where: {
        tenantId: req.tenantId as string,
        nombre: { equals: nombre, mode: "insensitive" },
        NOT: { id: service.id },
      },
    });

    if (duplicado) {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
    }
  }

  try {
    const actualizado = await prisma.service.update({
      where: { id: service.id, tenantId: req.tenantId as string },
      data: { nombre, duracionMin, precio },
    });
    res.json(actualizado);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
    }
    throw err;
  }
});

router.delete("/:id", soloDueno, async (req, res) => {
  const service = await prisma.service.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId as string },
  });

  if (!service) {
    return res.status(404).json({ error: "Servicio no encontrado" });
  }

  const citasLigadas = await prisma.appointment.count({
    where: { serviceId: service.id, tenantId: req.tenantId as string },
  });

  if (citasLigadas > 0) {
    return res.status(409).json({ error: "No se puede eliminar: tiene citas asociadas" });
  }

  await prisma.service.delete({ where: { id: service.id, tenantId: req.tenantId as string } });
  res.status(204).send();
});

export default router;
