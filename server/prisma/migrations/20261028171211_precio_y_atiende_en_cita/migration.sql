-- Precio guardado en la cita y persona que la atiende.
-- Editada a mano (prisma migrate dev --create-only) para agregar el backfill del precio.
--
-- Compatible con el código viejo mientras Render hace el build: las dos columnas son
-- opcionales, así que el POST /appointments viejo (que no las manda) sigue funcionando.
-- Una segunda migración, en otro deploy, rellena los precios que hayan quedado en null
-- en esa ventana y vuelve la columna obligatoria.

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "atiendeId" TEXT,
ADD COLUMN     "precio" DECIMAL(65,30);

-- Backfill: cada cita existente toma el precio actual de su servicio (es lo mejor que
-- se sabe: antes de esta migración el precio no se guardaba).
UPDATE "Appointment" a
SET "precio" = s."precio"
FROM "Service" s
WHERE s."id" = a."serviceId" AND a."precio" IS NULL;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_atiendeId_fkey" FOREIGN KEY ("atiendeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
