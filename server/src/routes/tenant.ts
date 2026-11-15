import { Router } from "express";
import { transaccionDelTenant } from "../db";
import { soloDueno, verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import { horarioSchema, negocioSchema, HorarioInput, NegocioInput } from "../schemas";

// Datos del negocio de quien hace la petición. El id sale del token, nunca de la URL ni del body.
const router = Router();

router.use(verificarToken);

router.patch("/", soloDueno, validar(negocioSchema), async (req, res) => {
  const { nombre } = req.body as NegocioInput;
  const tenant = await req.db.tenant.update({
    where: { id: req.tenantId as string },
    data: { nombre },
    select: { id: true, nombre: true },
  });
  res.json(tenant);
});

// --- Horario de apertura ---
// Minutos desde medianoche en la zona del negocio; un día que no aparece está cerrado y una
// lista vacía es "sin horario" (se acepta cualquier hora). Ver schema.prisma.

const DIA_HORARIO = { diaSemana: true, abreMin: true, cierraMin: true };

// Lo ven dueño y empleado: el selector de citas solo ofrece horas abiertas.
router.get("/horario", async (req, res) => {
  const tenantId = req.tenantId as string;
  const [tenant, dias] = await Promise.all([
    req.db.tenant.findUnique({ where: { id: tenantId }, select: { zonaHoraria: true } }),
    req.db.horarioDia.findMany({ where: { tenantId }, select: DIA_HORARIO, orderBy: { diaSemana: "asc" } }),
  ]);
  res.json({ zonaHoraria: tenant?.zonaHoraria ?? null, dias });
});

// Reemplaza la semana completa. Borrar e insertar van en UNA transacción con app.tenant_id
// fijado dentro (transaccionDelTenant): si algo falla no queda a medias, y RLS solo deja borrar
// e insertar filas de este negocio.
router.put("/horario", soloDueno, validar(horarioSchema), async (req, res) => {
  const { dias } = req.body as HorarioInput;
  const tenantId = req.tenantId as string;
  const guardados = await transaccionDelTenant(tenantId, async (tx) => {
    await tx.horarioDia.deleteMany({ where: { tenantId } });
    if (dias.length > 0) {
      await tx.horarioDia.createMany({ data: dias.map((d) => ({ ...d, tenantId })) });
    }
    return tx.horarioDia.findMany({ where: { tenantId }, select: DIA_HORARIO, orderBy: { diaSemana: "asc" } });
  });
  const tenant = await req.db.tenant.findUnique({ where: { id: tenantId }, select: { zonaHoraria: true } });
  res.json({ zonaHoraria: tenant?.zonaHoraria ?? null, dias: guardados });
});

export default router;
