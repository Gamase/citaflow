-- Reservas en línea (página pública /reservar/<slug>). Compatible con el código viejo, que
-- sigue sirviendo durante el build de Render: Tenant.slug es opcional (ese código crea negocios
-- sin slug) y Appointment.origen tiene default (sus citas quedan como PANEL).

-- CreateEnum
CREATE TYPE "OrigenCita" AS ENUM ('PANEL', 'EN_LINEA');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "origen" "OrigenCita" NOT NULL DEFAULT 'PANEL';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");


-- Slug de los negocios que ya existen, con la misma regla que usa la API al registrar uno
-- nuevo (src/slug.ts): el nombre en minúsculas y sin acentos, lo que no sea letra o número se
-- vuelve guion, máximo 40 caracteres; si ya está tomado, se le agrega -2, -3…
-- Del más antiguo al más nuevo: el primero con ese nombre se queda el slug sin número.
DO $$
DECLARE
  t RECORD;
  base TEXT;
  candidato TEXT;
  n INT;
BEGIN
  FOR t IN SELECT id, nombre FROM "Tenant" WHERE slug IS NULL ORDER BY "creadoEn", id LOOP
    base := regexp_replace(
      translate(lower(t.nombre), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9]+', '-', 'g');
    base := trim(both '-' from left(trim(both '-' from base), 40));
    IF base = '' THEN
      base := 'negocio';
    END IF;
    candidato := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "Tenant" WHERE slug = candidato) LOOP
      n := n + 1;
      candidato := base || '-' || n;
    END LOOP;
    UPDATE "Tenant" SET slug = candidato WHERE id = t.id;
  END LOOP;
END $$;
