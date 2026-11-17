-- Base de datos y roles de Producción (EC2). Se corre UNA vez, como el superusuario local de
-- Postgres, con las dos contraseñas como variables (nunca escritas en este archivo):
--
--   sudo -u postgres psql -v ON_ERROR_STOP=1 \
--     -v pass_admin="$PASS_ADMIN" -v pass_app="$PASS_APP" -f server/scripts/roles-prod.sql
--
-- Dos roles, como en DEV (rol-app-dev.sql) pero sin contraseñas fijas:
-- - citaflow_admin: dueño de la base, del esquema public y de las tablas. Lo usan las
--   migraciones (deploy-prod.sh, vía DATABASE_URL_ADMIN) y el seed. No es superusuario.
-- - citaflow_app: con el que se conecta la API (DATABASE_URL). Sin superusuario ni BYPASSRLS y
--   sin ser dueño de nada: RLS le aplica siempre. Solo lee y escribe datos.
-- probar-rls.ts debe pasar en Prod con citaflow_app antes de dar RLS por activo.

CREATE ROLE citaflow_admin LOGIN PASSWORD :'pass_admin' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE citaflow_app LOGIN PASSWORD :'pass_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

CREATE DATABASE citaflow_db OWNER citaflow_admin;

\connect citaflow_db

-- En Postgres 15+ solo el dueño del esquema public puede crear tablas en él: las migraciones
-- (incluida la tabla _prisma_migrations) las crea citaflow_admin.
ALTER SCHEMA public OWNER TO citaflow_admin;
REVOKE ALL ON DATABASE citaflow_db FROM PUBLIC;
GRANT CONNECT ON DATABASE citaflow_db TO citaflow_admin, citaflow_app;
GRANT USAGE ON SCHEMA public TO citaflow_app;

-- La API lee y escribe datos; el esquema es de las migraciones. Las tablas que creen las
-- migraciones (como citaflow_admin) le dan acceso a citaflow_app automáticamente.
ALTER DEFAULT PRIVILEGES FOR ROLE citaflow_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO citaflow_app;
ALTER DEFAULT PRIVILEGES FOR ROLE citaflow_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO citaflow_app;
