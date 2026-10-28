#!/usr/bin/env bash
# Solo DEV: corre un comando con DATABASE_URL = DATABASE_URL_ADMIN de server/.env (el dueño
# de las tablas), para migraciones y seed. La API usa DATABASE_URL (citaflow_app, con RLS).
# Lo usan `npm run db:migrate` y `npm run db:seed`. Staging no lo usa: ahí se pasa
# DATABASE_URL en la terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
url=$(sed -n 's/^DATABASE_URL_ADMIN="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .env 2>/dev/null || true)
[ -n "$url" ] || { echo "Falta DATABASE_URL_ADMIN en server/.env (ver .env.example)" >&2; exit 1; }
DATABASE_URL="$url" exec "$@"
