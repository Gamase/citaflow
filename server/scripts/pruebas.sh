#!/usr/bin/env bash
# Pruebas de humo de la API: casos malos → 400/404/409 (nunca 500) y casos buenos → 2xx.
#
# Uso (desde server/):  bash scripts/pruebas.sh <URL_API> [dev|staging|prod]
#   (ejemplos por entorno en DEMO.md, sección 0.4)
#
# Las cuentas salen de prisma/seed-data.ts (los dos primeros negocios del entorno),
# así que la BD tiene que tener ese seed, de hoy o de ayer (el resumen del dashboard se
# compara contra las citas que sembró, que van de -14 a +7 días). Deja los datos como estaban, salvo tres citas
# CANCELADAS ~40 días adelante y dos empleados de prueba activos en el negocio A (nada se
# borra en CitaFlow; el siguiente seed los limpia).
#
# Variables opcionales:
#   ORIGEN_OK=<url del front>  también prueba que ese origen SÍ pase CORS.
#   IP_REAL=<tu IP pública>    también prueba que la clave del rate limit sea esa IP (para
#                              ajustar TRUST_PROXY). Ej.: IP_REAL=$(curl -s -4 https://api.ipify.org)
#   JWT_SECRET=<el del entorno> prueba que un token bien firmado pero de un usuario o negocio
#                              que ya no existe dé 401. Sin ella ese caso se salta.
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
  console.log(d.tenants[0]!.empleado.email, d.tenants[0]!.empleado.password);
" 2>/dev/null) || { echo "Entorno \"$LABEL\" no existe en prisma/seed-data.ts" >&2; exit 1; }

read -r A_EMAIL A_PASS <<< "$(sed -n 1p <<< "$CUENTAS")"
read -r B_EMAIL B_PASS <<< "$(sed -n 2p <<< "$CUENTAS")"
read -r E_EMAIL E_PASS <<< "$(sed -n 3p <<< "$CUENTAS")"

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
TEL_A=$(primero clients "$TA" telefono)
SRV_A=$(primero services "$TA" id)
PRECIO_A=$(primero services "$TA" precio)
CLI_B=$(primero clients "$TB" id)
UUID0=00000000-0000-4000-8000-000000000000
FUT=$(node -p 'const d=new Date(Date.now()+40*864e5); d.setUTCHours(3,11,0,0); d.toISOString()')
FUT2=$(node -p "new Date(new Date('$FUT').getTime() + 2*3600e3).toISOString()")
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

echo "== Token de un usuario o negocio que no existe"
if [ -z "${JWT_SECRET:-}" ]; then
  echo "⏭️  Se salta: define JWT_SECRET (el del entorno que pruebas) para correr este caso."
else
  # Datos del payload de un token (sin verificar la firma: solo para leer los ids).
  payload() { node -e 'const p = process.argv[1].split(".")[1]; console.log(JSON.parse(Buffer.from(p, "base64url"))[process.argv[2]])' "$1" "$2"; }
  firmar() { node -e 'console.log(require("jsonwebtoken").sign({ userId: process.argv[1], tenantId: process.argv[2] }, process.env.JWT_SECRET, { expiresIn: "5m" }))' "$1" "$2"; }
  UID_A=$(payload "$TA" userId)
  # Control: un token con los ids reales de A firmado con este JWT_SECRET tiene que pasar.
  # Si no, el secreto no es el de este entorno y un 401 no probaría nada.
  CONTROL=$(firmar "$UID_A" "$(payload "$TA" tenantId)")
  if [ "$(curl -s -m 90 -o /dev/null -w "%{http_code}" "$API/clients" -H "Authorization: Bearer $CONTROL")" != "200" ]; then
    echo "⏭️  Se salta: JWT_SECRET no es el de este entorno (el token de control no pasó)."
  else
    t "token de control (ids reales)"  200 GET /clients "$CONTROL"
    t "token con ids inexistentes"     401 GET /clients "$(firmar "$UUID0" "$UUID0")"
    t "token con negocio inexistente (crear)" 401 POST /clients "$(firmar "$UID_A" "$UUID0")" '{"nombre":"X","telefono":"5500000000"}'
    t "token: usuario de A + negocio de B" 401 GET /clients "$(firmar "$UID_A" "$(payload "$TB" tenantId)")"
  fi
fi

echo "== Dashboard"
# Rango de ±16 días (32, el máximo que acepta la API): cubre las citas del seed (de -14 a
# +7 días) aunque se haya sembrado ayer, y deja fuera las que crea este script (+40 días).
# Se usa para "hoy" y para "mes" a la vez.
rango() { node -p "const n=Date.now(), d=864e5; const a=new Date(n-($1)*d).toISOString(), b=new Date(n+($2)*d).toISOString();
  'hoyDesde='+a+'&hoyHasta='+b+'&mesDesde='+a+'&mesHasta='+b"; }
Q_OK=$(rango 16 16)
t "resumen sin token"              401 GET "/dashboard/resumen?$Q_OK"
t "resumen rango al revés"         400 GET "/dashboard/resumen?$(rango -15 -16)" "$TA"
t "resumen rango de 40 días"       400 GET "/dashboard/resumen?$(rango 20 20)" "$TA"
t "resumen fecha inválida"         400 GET "/dashboard/resumen?hoyDesde=no-es-fecha&hoyHasta=x&mesDesde=x&mesHasta=x" "$TA"
t "resumen sin parámetros"         400 GET "/dashboard/resumen" "$TA"

# Lo que sembró el seed para cada negocio, calculado de prisma/seed-data.ts (sin números
# fijos): clientes, servicios, citas por estado e ingresos (precio de cada Atendida).
ESPERADO=$(npx --no-install tsx -e "
  import { DATASETS } from './prisma/seed-data';
  console.log(JSON.stringify(DATASETS['$LABEL']!.tenants.slice(0, 2).map((t) => {
    const porEstado: Record<string, number> = {};
    for (const c of t.citas) porEstado[c.estado] = (porEstado[c.estado] ?? 0) + 1;
    const ingresos = t.citas
      .filter((c) => c.estado === 'COMPLETADA')
      .reduce((suma, c) => suma + t.servicios[c.servicio]!.precio, 0);
    return { clientes: t.clientes.length, servicios: t.servicios.length, porEstado, ingresos };
  })));
" 2>/dev/null)

# aislamiento "negocio" índice  → compara el último resumen recibido contra el seed de ese negocio.
aislamiento() {
  local salida
  salida=$(node -e '
    const fs = require("fs");
    const [archivo, esperado, i, nombre] = process.argv.slice(1);
    const r = JSON.parse(fs.readFileSync(archivo)), e = JSON.parse(esperado)[Number(i)];
    const pista = " → ¿El seed no es de hoy o de ayer? Corre el seed de este entorno y vuelve a intentar";
    const linea = (ok, desc, detalle) => console.log((ok ? "✅ " : "❌ ") + desc.padEnd(40) + " " + detalle);
    const ESTADOS = ["PENDIENTE", "CONFIRMADA", "COMPLETADA", "NO_ASISTIO", "CANCELADA"];
    const esp = Object.fromEntries(ESTADOS.map((s) => [s, e.porEstado[s] ?? 0]));
    const total = ESTADOS.reduce((a, s) => a + esp[s], 0);
    const okEstados = ESTADOS.every((s) => r.mes.porEstado[s] === esp[s]) && r.hoy.length === total;
    linea(okEstados, nombre + ": citas = las del seed",
      okEstados ? total + " citas" : "esperado " + JSON.stringify(esp) + ", obtenido " + JSON.stringify(r.mes.porEstado) + pista);
    const okTotales = r.totales.clientes === e.clientes && r.totales.servicios === e.servicios;
    linea(okTotales, nombre + ": clientes y servicios = seed",
      r.totales.clientes + " / " + r.totales.servicios + (okTotales ? "" : " (esperado " + e.clientes + " / " + e.servicios + "). ¿Se agregaron datos a mano? Corre el seed"));
    const resueltas = esp.COMPLETADA + esp.NO_ASISTIO;
    const tasa = resueltas === 0 ? null : esp.NO_ASISTIO / resueltas;
    linea(r.mes.tasaNoAsistencia === tasa, nombre + ": tasa de no asistencia",
      String(r.mes.tasaNoAsistencia) + (r.mes.tasaNoAsistencia === tasa ? "" : " (esperado " + tasa + ")" + pista));
    const okIngresos = Math.abs(r.mes.ingresos - e.ingresos) < 0.005;
    linea(okIngresos, nombre + ": ingresos = suma de atendidas", String(r.mes.ingresos) + (okIngresos ? "" : " (esperado " + e.ingresos + ")" + pista));
    const ahora = Date.now() - 60e3;
    const okProximas = r.proximas.length <= 5 && r.proximas.every((c, j, a) =>
      new Date(c.fechaHora).getTime() >= ahora && ["PENDIENTE", "CONFIRMADA"].includes(c.estado) &&
      (j === 0 || a[j - 1].fechaHora <= c.fechaHora));
    linea(okProximas, nombre + ": próximas (futuras, activas, en orden)", r.proximas.length + " citas");
  ' "$RESP" "$ESPERADO" "$2" "$1")
  echo "$salida"
  TOTAL=$((TOTAL + $(grep -c . <<< "$salida")))
  FALLAS=$((FALLAS + $(grep -c "^❌" <<< "$salida")))
}
t "resumen negocio A"              200 GET "/dashboard/resumen?$Q_OK" "$TA"
aislamiento "A" 0
t "resumen negocio B"              200 GET "/dashboard/resumen?$Q_OK" "$TB"
aislamiento "B" 1

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
t "PATCH cliente de otro negocio"  404 PATCH "/clients/$CLI_B" "$TA" '{"nombre":"Intruso"}'
t "PATCH cliente body vacío"       400 PATCH "/clients/$CLI_TMP" "$TA" '{}'
t "PATCH teléfono de 9 dígitos"    400 PATCH "/clients/$CLI_TMP" "$TA" '{"telefono":"123456789"}'
t "PATCH teléfono de otro cliente" 409 PATCH "/clients/$CLI_TMP" "$TA" "{\"telefono\":\"$TEL_A\"}"
t "PATCH cliente válido"           200 PATCH "/clients/$CLI_TMP" "$TA" '{"nombre":"Prueba editada","email":"prueba@ejemplo.com"}'
t "PATCH quitar email (null)"      200 PATCH "/clients/$CLI_TMP" "$TA" '{"email":null}'
t "DELETE cliente de otro negocio" 404 DELETE "/clients/$CLI_B" "$TA"
t "DELETE cliente sin citas"       204 DELETE "/clients/$CLI_TMP" "$TA"

echo "== Búsqueda y filtros"
# cumple "descripción" 'expresión JS sobre r (el último JSON recibido)' → ✅ si es verdadera.
cumple() {
  local desc=$1 expr=$2 detalle
  TOTAL=$((TOTAL + 1))
  if detalle=$(node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1]));
    console.log(Array.isArray(r) ? r.length + " resultados" : "");
    process.exit(new Function("r", "return (" + process.argv[2] + ")")(r) ? 0 : 1);
  ' "$RESP" "$expr"); then
    printf "✅ %-40s %s\n" "$desc" "$detalle"
  else
    FALLAS=$((FALLAS + 1))
    printf "❌ %-40s %s  %s\n" "$desc" "$detalle" "$(head -c 90 "$RESP")"
  fi
}
enc() { node -p 'encodeURIComponent(process.argv[1])' "$1"; }

# Qué buscar y cuántos resultados esperar, calculado de prisma/seed-data.ts.
BUSQUEDA=$(npx --no-install tsx -e "
  import { DATASETS } from './prisma/seed-data';
  const [a, b] = DATASETS['$LABEL']!.tenants;
  const min = (s: string) => s.toLowerCase();
  const apellido = a!.clientes[1]!.nombre.split(' ')[1]!;
  const tel = a!.clientes[2]!.telefono;
  const finTel = tel.slice(6);
  const soloB = b!.clientes.find((c) => !a!.clientes.some((x) => min(x.nombre).includes(min(c.nombre))))!.nombre;
  const porEstado = (t: typeof a, e: string) => t!.citas.filter((c) => c.estado === e).length;
  console.log(apellido.toUpperCase());
  console.log(a!.clientes.filter((c) => min(c.nombre).includes(min(apellido))).length);
  console.log(tel.slice(0, 3) + ' ' + tel.slice(3, 6) + ' ' + tel.slice(6));
  console.log(tel);
  console.log(finTel.slice(0, 2) + '-' + finTel.slice(2));
  console.log(a!.clientes.filter((c) => c.telefono.includes(finTel)).length);
  console.log(soloB);
  console.log(porEstado(a, 'COMPLETADA'));
  console.log(porEstado(b, 'COMPLETADA'));
  console.log(porEstado(a, 'PENDIENTE'));
  console.log(a!.citas.length);
" 2>/dev/null)
linea() { sed -n "${1}p" <<< "$BUSQUEDA"; }
APELLIDO=$(linea 1); N_APELLIDO=$(linea 2); TEL_FMT=$(linea 3); TEL_BUSCADO=$(linea 4)
FIN_TEL=$(linea 5); N_FIN_TEL=$(linea 6); SOLO_B=$(linea 7)
N_COMPLETADAS_A=$(linea 8); N_COMPLETADAS_B=$(linea 9); N_PENDIENTES_A=$(linea 10); N_CITAS_A=$(linea 11)

t "clientes sin búsqueda"          200 GET /clients "$TA"
N_TODOS=$(campo "$RESP" length)
t "buscar solo espacios = todos"   200 GET "/clients?q=%20%20" "$TA"
cumple "  mismos que sin búsqueda"   "r.length === $N_TODOS"
t "buscar nombre (\"$APELLIDO\")"  200 GET "/clients?q=$(enc "$APELLIDO")" "$TA"
cumple "  sin importar mayúsculas"   "r.length === $N_APELLIDO && r.every((c) => c.nombre.toLowerCase().includes('${APELLIDO,,}'))"
t "buscar teléfono con espacios"   200 GET "/clients?q=$(enc "$TEL_FMT")" "$TA"
cumple "  encuentra ese teléfono"    "r.length === 1 && r[0].telefono === '$TEL_BUSCADO'"
t "buscar parte del teléfono"      200 GET "/clients?q=$(enc "$FIN_TEL")" "$TA"
cumple "  coincide con el seed"      "r.length === $N_FIN_TEL"
t "A busca un cliente de B"        200 GET "/clients?q=$(enc "$SOLO_B")" "$TA"
cumple "  aislamiento: no lo ve"     "r.length === 0"
t "B sí lo encuentra"              200 GET "/clients?q=$(enc "$SOLO_B")" "$TB"
cumple "  (control)"                 "r.length >= 1"
t "búsqueda de 51 caracteres"      400 GET "/clients?q=$(printf 'a%.0s' $(seq 51))" "$TA"
t "búsqueda repetida (q=a&q=b)"    400 GET "/clients?q=a&q=b" "$TA"

# desde=hoy-$1 días, hasta=hoy+$2 días (negativo = hacia atrás).
rango_citas() { node -p "const n=Date.now(), d=864e5; 'desde='+new Date(n-($1)*d).toISOString()+'&hasta='+new Date(n+($2)*d).toISOString()"; }
t "citas estado inválido"          400 GET "/appointments?estado=VOLANDO" "$TA"
t "citas estado en minúsculas"     400 GET "/appointments?estado=pendiente" "$TA"
t "citas rango al revés"           400 GET "/appointments?$(rango_citas -15 -16)" "$TA"
t "citas rango de 40 días"         400 GET "/appointments?$(rango_citas 20 20)" "$TA"
t "citas solo desde"               400 GET "/appointments?$(rango_citas 1 1 | cut -d'&' -f1)" "$TA"
t "citas fecha inválida"           400 GET "/appointments?desde=no-es-fecha&hasta=x" "$TA"
t "citas sin filtros"              200 GET /appointments "$TA"
cumple "  todas (seed + las de pruebas)" "r.length >= $N_CITAS_A"
t "citas Atendidas de A"           200 GET "/appointments?estado=COMPLETADA" "$TA"
cumple "  solo Atendidas, las del seed" "r.length === $N_COMPLETADAS_A && r.every((c) => c.estado === 'COMPLETADA')"
t "citas Atendidas de B"           200 GET "/appointments?estado=COMPLETADA" "$TB"
cumple "  aislamiento: solo las de B" "r.length === $N_COMPLETADAS_B && r.every((c) => c.estado === 'COMPLETADA')"
# Un solo Date.now() para los dos extremos: con dos, el rango pasa de 32 días por milisegundos.
read -r DESDE HASTA <<< "$(node -p 'const n = Date.now(); new Date(n - 16*864e5).toISOString() + " " + new Date(n + 16*864e5).toISOString()')"
t "Pendientes de A en ±16 días"    200 GET "/appointments?estado=PENDIENTE&desde=$DESDE&hasta=$HASTA" "$TA"
cumple "  estado y rango respetados" "r.length === $N_PENDIENTES_A && r.every((c) => c.estado === 'PENDIENTE' && c.fechaHora >= '$DESDE' && c.fechaHora < '$HASTA')"

echo "== Historial del cliente"
# Candidatos de A con más citas primero, calculados de prisma/seed-data.ts. Se usa el primero
# que no sea $CLI_A: a ese el script le agrega citas y sus conteos ya no serían los del seed.
CANDIDATOS=$(npx --no-install tsx -e "
  import { DATASETS } from './prisma/seed-data';
  const a = DATASETS['$LABEL']!.tenants[0]!;
  const lista = a.clientes.map((c, i) => {
    const citas = a.citas.filter((x) => x.cliente === i);
    const porEstado: Record<string, number> = {};
    for (const x of citas) porEstado[x.estado] = (porEstado[x.estado] ?? 0) + 1;
    const gastado = citas.filter((x) => x.estado === 'COMPLETADA').reduce((s, x) => s + a.servicios[x.servicio]!.precio, 0);
    return { telefono: c.telefono, nombre: c.nombre, total: citas.length, porEstado, gastado };
  });
  lista.sort((x, y) => y.total - x.total);
  for (const c of lista) console.log(JSON.stringify(c));
" 2>/dev/null)
CLI_H=""; ESP_H=""
while read -r cand; do
  tel=$(campo - telefono <<< "$cand")
  id=$(curl -s -m 90 "$API/clients?q=$tel" -H "Authorization: Bearer $TA" | campo - "0.id")
  if [ -n "$id" ] && [ "$id" != "$CLI_A" ]; then CLI_H=$id; ESP_H=$cand; break; fi
done <<< "$CANDIDATOS"
echo "   (cliente: $(campo - nombre <<< "$ESP_H"), $(campo - total <<< "$ESP_H") citas en el seed)"
t "historial de un cliente"        200 GET "/clients/$CLI_H/historial" "$TA"
cumple "  conteos = los del seed"    "((e) => r.cliente.id === '$CLI_H' && r.resumen.total === e.total && r.citas.length === e.total && ['PENDIENTE','CONFIRMADA','COMPLETADA','NO_ASISTIO','CANCELADA'].every((s) => r.resumen.porEstado[s] === (e.porEstado[s] ?? 0)))($ESP_H)"
cumple "  total gastado = atendidas" "Math.abs(r.resumen.totalGastado - $(campo - gastado <<< "$ESP_H")) < 0.005"
cumple "  de la más reciente a la más vieja" "r.citas.every((c, i, a) => i === 0 || a[i - 1].fechaHora >= c.fechaHora)"
cumple "  próxima: la activa más cercana" "((ahora) => ((act) => act.length === 0 ? r.resumen.proxima === null : r.resumen.proxima?.id === act[0].id)(r.citas.filter((c) => c.fechaHora >= ahora && ['PENDIENTE','CONFIRMADA'].includes(c.estado)).sort((x, y) => x.fechaHora < y.fechaHora ? -1 : 1)))(new Date(Date.now() - 60e3).toISOString())"
t "historial: cliente de B"        404 GET "/clients/$CLI_B/historial" "$TA"
t "historial: cliente inexistente" 404 GET "/clients/$UUID0/historial" "$TA"
t "historial: id inválido"         400 GET "/clients/no-es-uuid/historial" "$TA"
t "historial sin token"            401 GET "/clients/$CLI_H/historial"
t "historial: empleado"            200 GET "/clients/$CLI_H/historial" "$(login "$E_EMAIL" "$E_PASS")"
cumple "  ve las citas, sin gastado ni precios" "r.resumen.total === $(campo - total <<< "$ESP_H") && r.resumen.totalGastado === null && r.citas.every((c) => !('precio' in c.service))"

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
t "POST segunda cita (+2 h)"       201 POST /appointments "$TA" "{\"clientId\":\"$CLI_A\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"$FUT2\"}"
CITA2=$(campo "$RESP" id)
t "reagendar a horario ocupado"    409 PATCH "/appointments/$CITA2" "$TA" "{\"fechaHora\":\"$FUT\"}"
t "reagendar al pasado"            400 PATCH "/appointments/$CITA2" "$TA" '{"fechaHora":"2020-01-01T10:00:00.000Z"}'
t "reagendar sin fecha"            400 PATCH "/appointments/$CITA2" "$TA" '{}'
t "reagendar cita ajena"           404 PATCH "/appointments/$CITA2" "$TB" "{\"fechaHora\":\"$FUT2\"}"
t "reagendar al mismo horario"     200 PATCH "/appointments/$CITA" "$TA" "{\"fechaHora\":\"$FUT\"}"
t "PATCH estado inexistente"       400 PATCH "/appointments/$CITA/estado" "$TA" '{"estado":"VOLANDO"}'
t "PATCH estado sin body"          400 PATCH "/appointments/$CITA/estado" "$TA"
t "PATCH Atendida en cita futura"  409 PATCH "/appointments/$CITA/estado" "$TA" '{"estado":"COMPLETADA"}'
t "PATCH estado de cita ajena"     404 PATCH "/appointments/$CITA/estado" "$TB" '{"estado":"CONFIRMADA"}'
t "PATCH Cancelar"                 200 PATCH "/appointments/$CITA/estado" "$TA" '{"estado":"CANCELADA"}'
t "reagendar cita cancelada"       409 PATCH "/appointments/$CITA" "$TA" "{\"fechaHora\":\"$FUT2\"}"
t "cancelar la segunda cita"       200 PATCH "/appointments/$CITA2/estado" "$TA" '{"estado":"CANCELADA"}'

echo "== Roles: empleado"
t "login empleado"                 200 POST /auth/login "" "{\"email\":\"$E_EMAIL\",\"password\":\"$E_PASS\"}"
cumple "  login devuelve rol EMPLEADO" "r.user.rol === 'EMPLEADO'"
TE=$(campo "$RESP" token)
t "login dueño"                    200 POST /auth/login "" "{\"email\":\"$A_EMAIL\",\"password\":\"$A_PASS\"}"
cumple "  login devuelve rol DUENO"  "r.user.rol === 'DUENO'"
FUT3=$(node -p "new Date(new Date('$FUT').getTime() + 4*3600e3).toISOString()")
t "empleado: crear cita"           201 POST /appointments "$TE" "{\"clientId\":\"$CLI_A\",\"serviceId\":\"$SRV_A\",\"fechaHora\":\"$FUT3\"}"
CITA3=$(campo "$RESP" id)
t "empleado: reagendar su cita"    200 PATCH "/appointments/$CITA3" "$TE" "{\"fechaHora\":\"$FUT3\"}"
t "empleado: cancelar la cita"     200 PATCH "/appointments/$CITA3/estado" "$TE" '{"estado":"CANCELADA"}'
t "empleado: ver servicios"        200 GET /services "$TE"
t "empleado: crear servicio"       403 POST /services "$TE" '{"nombre":"No debería","duracionMin":30,"precio":100}'
t "empleado: editar servicio"      403 PATCH "/services/$SRV_A" "$TE" '{"precio":1}'
t "empleado: borrar servicio"      403 DELETE "/services/$SRV_A" "$TE"
t "empleado: crear cliente"        201 POST /clients "$TE" "{\"nombre\":\"Prueba de empleado\",\"telefono\":\"$TEL\"}"
CLI_E=$(campo "$RESP" id)
t "empleado: editar cliente"       200 PATCH "/clients/$CLI_E" "$TE" '{"nombre":"Prueba de empleado (editado)"}'
t "empleado: borrar cliente"       403 DELETE "/clients/$CLI_E" "$TE"
t "dueño borra ese cliente"        204 DELETE "/clients/$CLI_E" "$TA"
t "empleado: ver equipo"           403 GET /users "$TE"
t "empleado: crear empleado"       403 POST /users "$TE" '{"nombre":"X","email":"x@ejemplo.test","password":"12345678"}'
t "empleado: resumen"              200 GET "/dashboard/resumen?$Q_OK" "$TE"
cumple "  sin ingresos (null)"       "r.mes.ingresos === null && r.mes.total > 0"
t "dueño: resumen"                 200 GET "/dashboard/resumen?$Q_OK" "$TA"
cumple "  con ingresos"              "typeof r.mes.ingresos === 'number'"

echo "== Roles: equipo (dueño)"
# id del usuario con ese email en la lista del equipo de ese token.
id_usuario() { curl -s -m 90 "$API/users" -H "Authorization: Bearer $1" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).find((u) => u.email === process.argv[1])?.id ?? ""));' "$2"; }
YO_A=$(id_usuario "$TA" "$A_EMAIL")
EMP_A=$(id_usuario "$TA" "$E_EMAIL")
EMP_B=$(curl -s -m 90 "$API/users" -H "Authorization: Bearer $TB" | campo - "1.id")
t "listar equipo"                  200 GET /users "$TA"
cumple "  solo los de A, sin password" "r.length >= 2 && r.every((u) => !('password' in u)) && r.some((u) => u.email === '$A_EMAIL' && u.rol === 'DUENO')"
NUEVO_EMAIL="prueba.$RANDOM$RANDOM@ejemplo.test"
t "crear empleado"                 201 POST /users "$TA" "{\"nombre\":\"Empleado de prueba\",\"email\":\"$NUEVO_EMAIL\",\"password\":\"12345678\"}"
cumple "  queda EMPLEADO y activo"   "r.rol === 'EMPLEADO' && r.activo === true && !('password' in r)"
NUEVO=$(campo "$RESP" id)
t "crear empleado: email repetido" 409 POST /users "$TA" "{\"nombre\":\"X\",\"email\":\"$E_EMAIL\",\"password\":\"12345678\"}"
t "crear empleado: email de B"     409 POST /users "$TA" "{\"nombre\":\"X\",\"email\":\"$B_EMAIL\",\"password\":\"12345678\"}"
t "crear empleado: password corta" 400 POST /users "$TA" '{"nombre":"X","email":"corta@ejemplo.test","password":"1234567"}'
t "crear empleado con rol DUENO"   201 POST /users "$TA" "{\"nombre\":\"Intento\",\"email\":\"rol.$RANDOM$RANDOM@ejemplo.test\",\"password\":\"12345678\",\"rol\":\"DUENO\"}"
cumple "  el rol del body se ignora" "r.rol === 'EMPLEADO'"
t "desactivarse a sí mismo"        409 PATCH "/users/$YO_A/activo" "$TA" '{"activo":false}'
t "activo no booleano"             400 PATCH "/users/$EMP_A/activo" "$TA" '{"activo":"no"}'
t "ver usuario de otro negocio"    404 GET "/users/$EMP_B" "$TA"
t "desactivar usuario de B"        404 PATCH "/users/$EMP_B/activo" "$TA" '{"activo":false}'
t "ver usuario inexistente"        404 GET "/users/$UUID0" "$TA"

echo "== Roles: editar empleados"
# Sobre el empleado recién creado ($NUEVO): el del seed no se toca.
NUEVO_EMAIL2="editado.$RANDOM$RANDOM@ejemplo.test"
t "editar empleado"                200 PATCH "/users/$NUEVO" "$TA" "{\"nombre\":\"Empleado editado\",\"email\":\"$NUEVO_EMAIL2\"}"
cumple "  nombre y email nuevos"     "r.nombre === 'Empleado editado' && r.email === '$NUEVO_EMAIL2' && r.rol === 'EMPLEADO'"
NUEVO_EMAIL=$NUEVO_EMAIL2
t "editar: email repetido"         409 PATCH "/users/$NUEVO" "$TA" "{\"email\":\"$E_EMAIL\"}"
t "editar: email del dueño de B"   409 PATCH "/users/$NUEVO" "$TA" "{\"email\":\"$B_EMAIL\"}"
t "editar: body vacío"             400 PATCH "/users/$NUEVO" "$TA" '{}'
t "editar: email inválido"         400 PATCH "/users/$NUEVO" "$TA" '{"email":"mal"}'
t "editar usuario de otro negocio" 404 PATCH "/users/$EMP_B" "$TA" '{"nombre":"Intruso"}'
t "editarse a sí mismo"            409 PATCH "/users/$YO_A" "$TA" '{"nombre":"Yo"}'
t "empleado intenta editar"        403 PATCH "/users/$NUEVO" "$TE" '{"nombre":"Intruso"}'
t "password: muy corta"            400 PATCH "/users/$NUEVO/password" "$TA" '{"password":"1234567"}'
t "password: la propia"            409 PATCH "/users/$YO_A/password" "$TA" '{"password":"otraclave123"}'
t "password: usuario de B"         404 PATCH "/users/$EMP_B/password" "$TA" '{"password":"otraclave123"}'
t "password: la cambia un empleado" 403 PATCH "/users/$NUEVO/password" "$TE" '{"password":"otraclave123"}'
t "restablecer contraseña"         204 PATCH "/users/$NUEVO/password" "$TA" '{"password":"temporal-nueva-1"}'
t "login con la anterior"          401 POST /auth/login "" "{\"email\":\"$NUEVO_EMAIL\",\"password\":\"12345678\"}"
t "login con la nueva"             200 POST /auth/login "" "{\"email\":\"$NUEVO_EMAIL\",\"password\":\"temporal-nueva-1\"}"
t "regresar la contraseña"         204 PATCH "/users/$NUEVO/password" "$TA" '{"password":"12345678"}'

echo "== Roles: desactivar y reactivar"
# Con el empleado recién creado, no con el del seed: si el script se corta a la mitad,
# el seed queda intacto.
TN=$(login "$NUEVO_EMAIL" 12345678)
t "empleado nuevo entra"           200 GET /clients "$TN"
t "dueño lo desactiva"             200 PATCH "/users/$NUEVO/activo" "$TA" '{"activo":false}'
cumple "  queda inactivo"            "r.activo === false"
t "su token vigente ya no sirve"   401 GET /clients "$TN"
t "y no puede iniciar sesión"      403 POST /auth/login "" "{\"email\":\"$NUEVO_EMAIL\",\"password\":\"12345678\"}"
t "dueño lo reactiva"              200 PATCH "/users/$NUEVO/activo" "$TA" '{"activo":true}'
t "el mismo token vuelve a servir" 200 GET /clients "$TN"

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
