import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import {
  busquedaClientesSchema,
  clienteSchema,
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

router.delete("/:id", async (req, res) => {
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
