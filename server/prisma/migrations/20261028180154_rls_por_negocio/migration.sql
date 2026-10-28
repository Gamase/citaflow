-- Row-Level Security: segunda capa de aislamiento entre negocios.
-- Escrita a mano (Prisma no genera políticas). Las rutas siguen filtrando con
-- `where: { tenantId }`; esto es la red de seguridad si alguna query lo olvida.
--
-- Cómo: la API usa req.db (src/db.ts), que antes de cada query hace
-- set_config('app.tenant_id', <tenant del token>, true). La política solo deja ver
-- (USING) y escribir (WITH CHECK) filas cuyo "tenantId" sea ese.
--
-- - Falla cerrado: sin app.tenant_id, current_setting(..., true) da NULL o '' y la
--   comparación nunca es verdadera → 0 filas, y los INSERT/UPDATE se rechazan.
-- - FORCE: por default el DUEÑO de la tabla se salta las políticas, y en Render la API
--   se conecta justo como dueño. FORCE hace que también le apliquen.
--   (A un superusuario o a un rol con BYPASSRLS nunca le aplican, ni con FORCE: por eso
--   en DEV la API usa citaflow_app; ver scripts/rol-app-dev.sql y scripts/probar-rls.ts.)
-- - app.bypass_rls = 'on': solo lo usa el seed (escribe en todos los negocios). Es por
--   convención: ninguna ruta lo fija y la API no ejecuta SQL libre. Limitación conocida.
-- - Tenant y User sin RLS: el login busca por email antes de saber el negocio.
--
-- Compatible con el código que ya está en producción (fase 1): ese código ya fija
-- app.tenant_id en cada query, y el seed ya entra con el bypass.

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_negocio ON "Service"
  FOR ALL
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_negocio ON "Client"
  FOR ALL
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_negocio ON "Appointment"
  FOR ALL
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');
