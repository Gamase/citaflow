-- Rol con el que se conecta la API en DEV (Docker). Solo para desarrollo.
--
-- Por qué: el usuario que crea Docker (citaflow_user, POSTGRES_USER) es superusuario y
-- tiene BYPASSRLS, y Postgres NUNCA aplica RLS a esos roles, ni con FORCE. Si la app se
-- conectara con él, RLS no haría nada en DEV. citaflow_app no es superusuario, no tiene
-- BYPASSRLS y no es dueño de las tablas.
--
-- Migraciones y seed siguen con citaflow_user (DATABASE_URL_ADMIN en server/.env).
-- En Render no hace falta: ahí la app se conecta con el dueño de las tablas, que no es
-- superusuario, y FORCE ROW LEVEL SECURITY le aplica las políticas.
--
-- Uso (una vez por BD; se puede repetir):
--   docker compose exec -T postgres psql -U citaflow_user -d citaflow_db < server/scripts/rol-app-dev.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'citaflow_app') THEN
    -- Password de desarrollo, como las de docker-compose.yml. Nunca usar este rol fuera de DEV.
    CREATE ROLE citaflow_app LOGIN PASSWORD 'citaflow_app_pass' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE citaflow_db TO citaflow_app;
GRANT USAGE ON SCHEMA public TO citaflow_app;

-- Leer y escribir datos (no cambiar el esquema: eso es de las migraciones).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citaflow_app;

-- Las tablas que creen migraciones futuras (como citaflow_user) también le dan acceso.
ALTER DEFAULT PRIVILEGES FOR ROLE citaflow_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO citaflow_app;
