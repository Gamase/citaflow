import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { soloDueno, verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import { negocioSchema, NegocioInput } from "../schemas";

// Datos del negocio de quien hace la petición. El id sale del token, nunca de la URL ni del body.
const router = Router();
const prisma = new PrismaClient();

router.use(verificarToken);

router.patch("/", soloDueno, validar(negocioSchema), async (req, res) => {
  const { nombre } = req.body as NegocioInput;
  const tenant = await prisma.tenant.update({
    where: { id: req.tenantId as string },
    data: { nombre },
    select: { id: true, nombre: true },
  });
  res.json(tenant);
});

export default router;
