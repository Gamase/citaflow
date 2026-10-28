-- REVERSA DE RLS — SOLO PARA EMERGENCIAS.
--
-- Para qué sirve: quitar Row-Level Security (la migración rls_por_negocio) si en algún
-- entorno las políticas rompen la app (listas vacías, 500, conteos en 0) y no hay tiempo de
-- arreglarlo. Las rutas siguen filtrando por tenantId, así que quitar RLS regresa al
-- aislamiento de una sola capa (aplicación) sin perder datos.
--
-- Cómo se aplica: Prisma no tiene migraciones de bajada. Se crea una migración NUEVA hacia
-- adelante con este SQL y se despliega como cualquier otra:
--   cd server
--   npm run db:migrate -- --create-only --name revertir_rls     (DEV; en DEV usa DATABASE_URL_ADMIN)
--   (pegar este SQL en la migration.sql que se creó, y luego)
--   npm run db:migrate
--   → commit + push: Render la aplica en el build (Staging) y deploy-prod.sh en Prod.
--
-- No usar salvo emergencia. Vive en scripts/ y NO en prisma/migrations a propósito: ahí
-- Prisma la aplicaría sola en el siguiente deploy.

DROP POLICY IF EXISTS aislamiento_por_negocio ON "Service";
ALTER TABLE "Service" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Service" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_por_negocio ON "Client";
ALTER TABLE "Client" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Client" DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_por_negocio ON "Appointment";
ALTER TABLE "Appointment" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" DISABLE ROW LEVEL SECURITY;
