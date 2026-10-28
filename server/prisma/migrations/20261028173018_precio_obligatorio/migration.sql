-- Segunda parte del precio guardado en la cita: la columna se vuelve obligatoria.
-- Va en un deploy aparte, después de que el código que siempre llena `precio` ya estaba
-- en producción. Editada a mano para rellenar primero las citas que el código viejo
-- haya creado sin precio durante el build de la migración anterior (con el precio
-- actual de su servicio, igual que aquel backfill).

UPDATE "Appointment" a
SET "precio" = s."precio"
FROM "Service" s
WHERE s."id" = a."serviceId" AND a."precio" IS NULL;

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "precio" SET NOT NULL;
