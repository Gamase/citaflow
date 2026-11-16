import { Router } from "express";
import { prisma, transaccionDelTenant } from "../db";
import { soloDueno, verificarToken } from "../middleware/auth";
import { validar } from "../middleware/validar";
import { horarioSchema, negocioSchema, HorarioInput, NegocioInput } from "../schemas";
import { asegurarSlug } from "../slug";

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

// Reservas en línea: el slug del negocio (su enlace público es /reservar/<slug> en el front) y
// lo que le falta para recibir reservas. Lo puede ver cualquiera del negocio; lo muestra Ajustes.
router.get("/reservas", async (req, res) => {
  const tenantId = req.tenantId as string;
  const [slug, diasAbiertos, servicios] = await Promise.all([
    // Con el prisma base: el slug es único entre TODOS los negocios y Tenant no tiene RLS.
    asegurarSlug(prisma, tenantId),
    req.db.horarioDia.count({ where: { tenantId } }),
    req.db.service.count({ where: { tenantId } }),
  ]);
  res.json({ slug, tieneHorario: diasAbiertos > 0, tieneServicios: servicios > 0 });
});

export default router;
