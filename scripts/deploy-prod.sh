#!/usr/bin/env bash
#
# Despliegue de CitaFlow a Producción. Se corre DENTRO de la EC2, como el usuario ubuntu:
#
#   ~/citaflow/scripts/deploy-prod.sh
#
# Pasos: git pull → dependencias del server → build del client → prisma migrate deploy
#        → pm2 restart → copia a la carpeta de Nginx.
# El client se compila antes de tocar la base o el backend: si el build falla,
# producción queda intacta. Nunca corre el seed. Se detiene ante el primer error.
#
# Todo va dentro de main(): bash lee la función completa antes de ejecutarla,
# así el `git pull` puede actualizar este mismo archivo sin romper la ejecución.

set -Eeuo pipefail

main() {
  local REPO_DIR PM2_APP NGINX_DIR HEALTH_URL
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  PM2_APP="citaflow-api"
  NGINX_DIR="/var/www/html"
  HEALTH_URL="http://localhost:3000/health"

  paso() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
  falla() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }
  trap 'printf "\n\033[1;31mDespliegue detenido: falló \"%s\" (línea %s).\033[0m\n" "$BASH_COMMAND" "$LINENO" >&2' ERR

  # ── Verificaciones previas: no se toca nada si alguna falla ──────────────
  paso "Verificando el entorno"
  [[ $EUID -ne 0 ]] || falla "No lo corras con sudo: PM2 corre bajo el usuario ubuntu. El script pide sudo solo para copiar a $NGINX_DIR."
  cd "$REPO_DIR"
  [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || falla "La EC2 no está en la rama main."
  [[ -z "$(git status --porcelain --untracked-files=no)" ]] || falla "Hay cambios locales sin commitear en la EC2 (git status). Resuélvelos antes de desplegar."
  [[ -f server/.env ]] || falla "Falta server/.env (DATABASE_URL, JWT_SECRET)."
  grep -q '^VITE_API_URL=' client/.env.production 2>/dev/null || falla "Falta VITE_API_URL en client/.env.production."
  pm2 describe "$PM2_APP" >/dev/null 2>&1 || falla "PM2 no tiene un proceso llamado $PM2_APP."
  [[ -d "$NGINX_DIR" ]] || falla "No existe $NGINX_DIR."
  sudo -n true 2>/dev/null || falla "este usuario necesita sudo sin contraseña"

  # ── 1. Código ─────────────────────────────────────────────────────────────
  paso "1/6 git pull"
  local antes
  antes="$(git rev-parse --short HEAD)"
  git pull --ff-only origin main
  echo "Versión: $antes → $(git rev-parse --short HEAD)"

  # ── 2. Dependencias y build (todavía no se toca nada de producción) ──────
  paso "2/6 Dependencias del server"
  cd "$REPO_DIR/server"
  npm ci
  npx prisma generate

  paso "3/6 Build del client"
  cd "$REPO_DIR/client"
  npm ci
  npm run build   # vite.config.ts aborta si VITE_API_URL falta o apunta a localhost
  [[ -f dist/index.html ]] || falla "El build no generó dist/index.html."

  # ── 3. Base de datos y reinicio ───────────────────────────────────────────
  paso "4/6 Migraciones (prisma migrate deploy — sin seed)"
  cd "$REPO_DIR/server"
  npx prisma migrate deploy

  paso "5/6 Reiniciando $PM2_APP"
  pm2 restart "$PM2_APP"
  local ok=0
  for _ in $(seq 1 20); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  [[ $ok -eq 1 ]] || falla "El backend no responde en $HEALTH_URL tras 20 s. Revisa: pm2 logs $PM2_APP"
  echo "Backend OK ($HEALTH_URL)"

  # ── 4. Publicar ───────────────────────────────────────────────────────────
  paso "6/6 Publicando en $NGINX_DIR"
  cd "$REPO_DIR/client"
  sudo find "$NGINX_DIR" -mindepth 1 -delete
  sudo cp -r dist/. "$NGINX_DIR/"
  echo "Copiado dist/ → $NGINX_DIR"

  trap - ERR
  printf '\n\033[1;32m✔ Producción actualizada a %s.\033[0m\n' "$(git -C "$REPO_DIR" rev-parse --short HEAD)"
}

main "$@"
exit
