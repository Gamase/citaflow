#!/usr/bin/env bash
# Pruebas de humo de la API: casos malos → 400/404/409 (nunca 500) y casos buenos → 2xx.
#
# Uso (desde server/):  bash scripts/pruebas.sh <URL_API> [dev|staging|prod]
#   (ejemplos por entorno en DEMO.md, sección 0.4)
#
# Las cuentas salen de prisma/seed-data.ts (los dos primeros negocios del entorno),
# así que la BD tiene que tener ese seed. Deja los datos como estaban, salvo una cita
# CANCELADA ~40 días adelante (nada se borra en CitaFlow).
#
# Variables opcionales:
#   ORIGEN_OK=<url del front>  también prueba que ese origen SÍ pase CORS.
#   IP_REAL=<tu IP pública>    también prueba que la clave del rate limit sea esa IP (para
#                              ajustar TRUST_PROXY). Ej.: IP_REAL=$(curl -s -4 https://api.ipify.org)
#   PROBAR_429=1               al final fuerza el rate limit del login (429). Deja tu IP
#                              bloqueada 15 min para login fallido: úsalo solo en local.

set -u
API=${1:-}
LABEL=${2:-dev}

if [ -z "$API" ]; then
  echo "Uso: bash scripts/pruebas.sh <URL_API> [dev|staging|prod]" >&2
  exit 1
fi
API=${API%/}

cd "$(dirname "$0")/.."

CUENTAS=$(npx --no-install tsx -e "
  import { DATASETS } from './prisma/seed-data';
  const d = DATASETS['$LABEL'];
  if (!d || d.tenants.length < 2) process.exit(1);
  for (const t of d.tenants.slice(0, 2)) console.log(t.email, t.password);
" 2>/dev/null) || { echo "Entorno \"$LABEL\" no existe en prisma/seed-data.ts" >&2; exit 1; }

read -r A_EMAIL A_PASS <<< "$(sed -n 1p <<< "$CUENTAS")"
read -r B_EMAIL B_PASS <<< "$(sed -n 2p <<< "$CUENTAS")"

RESP=$(mktemp)
trap 'rm -f "$RESP"' EXIT
J="Content-Type: application/json"
FALLAS=0
TOTAL=0

# Lee un campo del último JSON recibido (o de stdin con "-").
campo() { node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(process.argv[1]==="-"?0:process.argv[1])); const v=process.argv[2].split(".").reduce((o,k)=>o?.[k],d); console.log(v ?? "")' "$1" "$2"; }

# h "descripción" sí|no "Encabezado" MÉTODO /ruta [Origin] [encabezado extra] [body JSON]
# Revisa si la respuesta trae (sí) o no (no) cierto encabezado.
h() {
  local desc=$1 debe=$2 header=$3 met=$4 ruta=$5 origen=${6:-} extra=${7:-} body=${8:-}
  local args=(-s -m 90 -o /dev/null -D - -X "$met" "$API$ruta")
  [ -n "$origen" ] && args+=(-H "Origin: $origen")
  [ -n "$extra" ] && args+=(-H "$extra")
  [ -n "$body" ] && args+=(-H "$J" --data-raw "$body")
  local valor
  valor=$(curl "${args[@]}" | tr -d '\r' | grep -i "^$header:" | head -1)
  TOTAL=$((TOTAL + 1))
  local ok="✅"
  if { [ "$debe" = "sí" ] && [ -z "$valor" ]; } || { [ "$debe" = "no" ] && [ -n "$valor" ]; }; then
    ok="❌"; FALLAS=$((FALLAS + 1))
  fi
  printf "%s %-40s debe traerlo: %-2s  %s\n" "$ok" "$desc" "$debe" "${valor:-(sin $header)}"
}

# t "descripción" esperado MÉTODO /ruta [token] [body]
t() {
  local desc=$1 esp=$2 met=$3 ruta=$4 tok=${5:-} body=${6:-}
  local args=(-s -m 90 -o "$RESP" -w "%{http_code}" -X "$met" "$API$ruta" -H "$J")
  [ -n "$tok" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$body" ] && args+=(--data-raw "$body")
  local code
  code=$(curl "${args[@]}")
  TOTAL=$((TOTAL + 1))
  local ok="✅"
  if [ "$code" != "$esp" ]; then ok="❌"; FALLAS=$((FALLAS + 1)); fi
  printf "%s %-40s esperado %s, obtuvo %s  %s\n" "$ok" "$desc" "$esp" "$code" "$(head -c 90 "$RESP")"
}

login() {
  curl -s -m 90 -X POST "$API/auth/login" -H "$J" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | campo - token
}

TA=$(login "$A_EMAIL" "$A_PASS")
TB=$(login "$B_EMAIL" "$B_PASS")
if [ -z "$TA" ] || [ -z "$TB" ]; then
  echo "No se pudo hacer login con las cuentas del seed \"$LABEL\". ¿La BD tiene ese seed?" >&2
  exit 1
fi

primero() { curl -s -m 90 "$API/$1" -H "Authorization: Bearer $2" | campo - "0.$3"; }
CLI_A=$(primero clients "$TA" id)
SRV_A=$(primero services "$TA" id)
PRECIO_A=$(primero services "$TA" precio)
CLI_B=$(primero clients "$TB" id)
UUID0=00000000-0000-4000-8000-000000000000
FUT=$(node -p 'const d=new Date(Date.now()+40*864e5); d.setUTCHours(3,11,0,0); d.toISOString()')
TEL="55$(printf %08d $((RANDOM * 1000 + RANDOM % 1000)))"

echo "API: $API  |  entorno: $LABEL  |  A: $A_EMAIL  |  B: $B_EMAIL"

MALO=https://origen-no-permitido.invalid
echo "== Encabezados de seguridad (helmet) y CORS"
h "sin X-Powered-By"                 no X-Powered-By GET /health
h "X-Content-Type-Options"           sí X-Content-Type-Options GET /health
h "CORS: origen no permitido"        no Access-Control-Allow-Origin GET /health "$MALO"
h "CORS: preflight no permitido"     no Access-Control-Allow-Origin OPTIONS /auth/login "$MALO" "Access-Control-Request-Method: POST"
if [ -n "${ORIGEN_OK:-}" ]; then
  h "CORS: origen permitido"         sí Access-Control-Allow-Origin GET /health "$ORIGEN_OK"
  h "CORS: preflight permitido"      sí Access-Control-Allow-Origin OPTIONS /auth/login "$ORIGEN_OK" "Access-Control-Request-Method: POST"
fi
# Con login correcto: no suma al contador de intentos fallidos.
h "login con rate limit"             sí RateLimit-Policy POST /auth/login "" "" "{\"email\":\"$A_EMAIL\",\"password\":\"$A_PASS\"}"
h "register con rate limit"          sí RateLimit-Policy POST /auth/register
h "rutas de datos sin rate limit"    no RateLimit-Policy GET /services "" "Authorization: Bearer $TA"

# La clave del rate limit (pk de RateLimit-Policy) sale de la IP que ve Express. Con un
# X-Forwarded-For inventado debe seguir igual; si cambia, TRUST_PROXY está alto y cualquiera
# puede brincarse el límite. Login correcto: no cuenta como intento fallido.
clave() {
  curl -s -m 90 -D - -o /dev/null -X POST "$API/auth/login" -H "$J" "$@" \
    --data-raw "{\"email\":\"$A_EMAIL\",\"password\":\"$A_PASS\"}" \
    | tr -d '\r' | grep -i '^ratelimit-policy:' | grep -o 'pk=:[^:]*:'
}
K0=$(clave); K1=$(clave -H "X-Forwarded-For: 203.0.113.7"); K2=$(clave -H "X-Forwarded-For: 198.51.100.9, 203.0.113.8")
TOTAL=$((TOTAL + 1))
if [ -n "$K0" ] && [ "$K0" = "$K1" ] && [ "$K0" = "$K2" ]; then
  printf "✅ %-40s %s\n" "XFF falso no cambia la clave" "$K0"
else
  FALLAS=$((FALLAS + 1))
  printf "❌ %-40s normal %s | falso %s | doble %s\n" "XFF falso no cambia la clave" "${K0:-?}" "${K1:-?}" "${K2:-?}"
fi
if [ -n "${IP_REAL:-}" ]; then
  # pk = primeros 12 caracteres del sha256 de la clave (en base64). La clave la arma la
  # propia librería: la IP tal cual en IPv4, la subred /56 en IPv6.
  ESPERADA=$(node -e 'const { ipKeyGenerator } = require("express-rate-limit");
    const h = require("crypto").createHash("sha256").update(ipKeyGenerator(process.argv[1])).digest("hex");
    console.log(h.slice(0, 12))' "$IP_REAL")
  OBTENIDA=$(printf %s "$K0" | sed 's/pk=://; s/://' | base64 -d 2>/dev/null)
  TOTAL=$((TOTAL + 1))
  if [ "$ESPERADA" = "$OBTENIDA" ]; then
    printf "✅ %-40s %s\n" "la clave es la IP real ($IP_REAL)" "$ESPERADA"
  else
    FALLAS=$((FALLAS + 1))
    printf "❌ %-40s esperada %s, obtenida %s\n" "la clave es la IP real ($IP_REAL)" "$ESPERADA" "${OBTENIDA:-?}"
  fi
fi

echo "== Auth"
t "login sin body"                 400 POST /auth/login
t "login JSON roto"                400 POST /auth/login "" '{"email":'
t "login password incorrecta"      401 POST /auth/login "" "{\"email\":\"$A_EMAIL\",\"password\":\"incorrecta\"}"
t "register password de 6"         400 POST /auth/register "" '{"nombreNegocio":"X","nombreUsuario":"X","email":"x@x.com","password":"123456"}'
t "register email inválido"        400 POST /auth/register "" '{"nombreNegocio":"X","nombreUsuario":"X","email":"no-es-email","password":"12345678"}'
t "register nombre negocio vacío"  400 POST /auth/register "" '{"nombreNegocio":"   ","nombreUsuario":"X","email":"x@x.com","password":"12345678"}'
t "register email repetido"        409 POST /auth/register "" "{\"nombreNegocio\":\"X\",\"nombreUsuario\":\"X\",\"email\":\"$A_EMAIL\",\"password\":\"12345678\"}"

echo "== Services"
t "POST sin nombre"                400 POST /services "$TA" '{"duracionMin":30,"precio":100}'
t "POST duración 0"                400 POST /services "$TA" '{"nombre":"Prueba","duracionMin":0,"precio":100}'
t "POST duración 2000"             400 POST /services "$TA" '{"nombre":"Prueba","duracionMin":2000,"precio":100}'
t "POST duración 30.5"             400 POST /services "$TA" '{"nombre":"Prueba","duracionMin":30.5,"precio":100}'
t "POST duración como texto"       400 POST /services "$TA" '{"nombre":"Prueba","duracionMin":"30","precio":100}'
t "POST precio negativo"           400 POST /services "$TA" '{"nombre":"Prueba","duracionMin":30,"precio":-1}'
t "PATCH body vacío"               400 PATCH "/services/$SRV_A" "$TA" '{}'
t "PATCH solo precio (mismo valor)" 200 PATCH "/services/$SRV_A" "$TA" "{\"precio\":$PRECIO_A}"
t "PATCH servicio inexistente"     404 PATCH "/services/$UUID0" "$TA" '{"precio":1}'
t "POST servicio 1440 min, precio 0" 201 POST /services "$TA" "{\"nombre\":\"  Prueba temporal $RANDOM  \",\"duracionMin\":1440,\"precio\":0}"
SRV_TMP=$(campo "$RESP" id)
t "DELETE servicio sin citas"      204 DELETE "/services/$SRV_TMP" "$TA"
t "DELETE servicio con citas"      409 DELETE "/services/$SRV_A" "$TA"

echo "== Clients"
t "POST teléfono de 9 dígitos"     400 POST /clients "$TA" '{"nombre":"Ana","telefono":"123456789"}'
t "POST sin nombre"                400 POST /clients "$TA" '{"telefono":"5512340000"}'
t "POST email inválido"            400 POST /clients "$TA" '{"nombre":"Ana","telefono":"5512340000","email":"mal"}'
t "POST cliente válido"            201 POST /clients "$TA" "{\"nombre\":\"Prueba temporal\",\"telefono\":\"$TEL\"}"
CLI_TMP=$(campo "$RESP" id)
t "POST mismo teléfono"            409 POST /clients "$TA" "{\"nombre\":\"Otra\",\"telefono\":\"$TEL\"}"
t "DELETE cliente de otro negocio" 404 DELETE "/clients/$CLI_B" "$TA"
t "DELETE cliente sin citas"       204 DELETE "/clients/$CLI_TMP" "$TA"

echo "== Appointments"
t "POST sin body"                  400 POST /appointments "$TA"
t "POST sin serviceId"             400 POST /appointments "$TA" "{\"clientId\":\"$CLI_A\",\"fechaHora\":\"$FUT\"}"
t "POST clientId no-uuid"          400 POST /appointments "$TA" "{\"clientId\":\"abc\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"$FUT\"}"
t "POST fecha inválida"            400 POST /appointments "$TA" "{\"clientId\":\"$CLI_A\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"mañana\"}"
t "POST fecha en el pasado"        400 POST /appointments "$TA" "{\"clientId\":\"$CLI_A\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"2020-01-01T10:00:00.000Z\"}"
t "POST cliente de otro negocio"   404 POST /appointments "$TA" "{\"clientId\":\"$CLI_B\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"$FUT\"}"
t "POST cita válida"               201 POST /appointments "$TA" "{\"clientId\":\"$CLI_A\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"$FUT\"}"
CITA=$(campo "$RESP" id)
t "POST mismo horario (choque)"    409 POST /appointments "$TA" "{\"clientId\":\"$CLI_A\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"$FUT\"}"
t "PATCH estado inexistente"       400 PATCH "/appointments/$CITA/estado" "$TA" '{"estado":"VOLANDO"}'
t "PATCH estado sin body"          400 PATCH "/appointments/$CITA/estado" "$TA"
t "PATCH Atendida en cita futura"  409 PATCH "/appointments/$CITA/estado" "$TA" '{"estado":"COMPLETADA"}'
t "PATCH estado de cita ajena"     404 PATCH "/appointments/$CITA/estado" "$TB" '{"estado":"CONFIRMADA"}'
t "PATCH Cancelar"                 200 PATCH "/appointments/$CITA/estado" "$TA" '{"estado":"CANCELADA"}'

if [ "${PROBAR_429:-}" = "1" ]; then
  echo "== Rate limit (PROBAR_429=1)"
  for i in $(seq 1 12); do
    code=$(curl -s -m 90 -o "$RESP" -w "%{http_code}" -X POST "$API/auth/login" -H "$J" -d "{\"email\":\"$A_EMAIL\",\"password\":\"incorrecta\"}")
    [ "$code" = "429" ] && break
  done
  t "login fallido repetido → 429"   429 POST /auth/login "" "{\"email\":\"$A_EMAIL\",\"password\":\"incorrecta\"}"
  t "login correcto también bloqueado" 429 POST /auth/login "" "{\"email\":\"$A_EMAIL\",\"password\":\"$A_PASS\"}"
fi

echo
echo "Resultado: $((TOTAL - FALLAS))/$TOTAL como se esperaba."
[ "$FALLAS" -eq 0 ]
