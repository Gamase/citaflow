# DEMO — CitaFlow (avance: multi-tenencia)

> Una sola app, una sola base. Cada negocio ve solo lo suyo.

---

## 0. Checklist antes de entrar

- ⚠️ **Volver a correr el seed del entorno de la demo** (`SEED_LABEL=prod` o `staging`, sección 5) si después del último seed se corrió `pruebas.sh` (0.4): el script deja una cita cancelada de prueba.

### 0.1 Learner Lab + Producción

- Iniciar el Learner Lab (dura ~4 h por sesión): prenderlo **antes** de entrar.
- Abrir **http://3.222.23.172** → login con Barbería funciona.
- Si algo no responde, por SSH en la EC2:

```bash
pm2 status
pm2 logs citaflow-api
curl localhost:3000/health   # esperado: {"status":"ok"}
```

### 0.2 Ventanas del navegador

- Ventana normal → **Barbería El Corte** (`admin@barberia.com` / `12345678`).
- Ventana incógnito → **Spa Relax** (`admin@sparelax.com` / `12345678`).
- Pestaña con la pantalla de **Registro** lista (ventana aparte o 2ª incógnito).
- Editor abierto en `server/` con estos archivos ya en pestañas:
  - `prisma/schema.prisma`
  - `src/routes/auth.ts`
  - `src/middleware/auth.ts`
  - `src/routes/appointments.ts`
  - `src/routes/services.ts`

### 0.3 Comandos curl listos (terminal aparte)

- URL de la API de Prod: sale de `VITE_API_URL` en `client/.env.production` de la EC2.
  - O: DevTools → Network en la app de Prod → ver a qué host pega el login.

```bash
API=<URL_API_PROD>
```

**Sacar el token de Barbería**

- Opción A, por curl:

```bash
TOKEN_BARBERIA=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@barberia.com","password":"12345678"}' | jq -r .token)
```

- Opción B, desde el navegador (ventana de Barbería) → DevTools → Console:

```js
localStorage.getItem("token")
```

**Sacar el ID de una cita del Spa** (con el token del Spa)

```bash
TOKEN_SPA=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sparelax.com","password":"12345678"}' | jq -r .token)

curl -s $API/appointments -H "Authorization: Bearer $TOKEN_SPA" \
  | jq '.[] | {id, estado, cliente: .client.nombre}'
```

- Para el bonus, sacar el id del tenant Spa:

```bash
curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@sparelax.com","password":"12345678"}' | jq -r .tenant.id
```

**Comando del ataque** (dejar pegado, con los placeholders reemplazados)

```bash
curl -i -X PATCH $API/appointments/<ID_CITA_SPA>/estado \
  -H "Authorization: Bearer <TOKEN_BARBERIA>" \
  -H "Content-Type: application/json" \
  -d '{"estado":"CONFIRMADA"}'
```

- Usar `CONFIRMADA`, no `CANCELADA`: si por error se manda con el token correcto, no deja la cita en un estado final.
- El `estado` tiene que ser válido: la ruta valida el estado **antes** de buscar la cita (si no, da 400 en vez de 404).

### 0.4 Pruebas de humo de la API (opcional)

- Script `server/scripts/pruebas.sh`: ~40 casos malos y buenos (400/404/409 esperados, nunca 500). Toma las cuentas del seed del entorno (`server/prisma/seed-data.ts`), así que la BD debe tener ese seed.
- Desde `server/`, con la URL base de la API y el entorno:

```bash
bash scripts/pruebas.sh http://localhost:3000                              # DEV
bash scripts/pruebas.sh https://citaflow-staging-api.onrender.com staging  # Staging
bash scripts/pruebas.sh <URL_API_PROD> prod                                # Prod
```

- Termina con `Resultado: N/N como se esperaba.` (exit 1 si algo falla). Deja los datos como estaban salvo una cita **cancelada** ~40 días adelante → volver a sembrar antes de la demo.
- Variables opcionales:
  - `ORIGEN_OK=<URL del front>`: también prueba que ese origen sí pase CORS. Ej.: `ORIGEN_OK=https://citaflow-staging-web.onrender.com bash scripts/pruebas.sh https://citaflow-staging-api.onrender.com staging`.
  - `IP_REAL=$(curl -s -4 https://api.ipify.org)`: también prueba que el rate limit use tu IP real (para ajustar `TRUST_PROXY`, ver abajo).
  - `PROBAR_429=1`: al final fuerza el 429 del login. **Bloquea tu IP 15 min** para login fallido (y en la escuela comparten IP): solo en local.
- Cuenta 2 logins fallidos por corrida; el límite es 10 cada 15 min por IP, así que caben ~5 corridas seguidas.
- **`TRUST_PROXY`** = cuántos proxies hay delante de la API, para que el rate limit vea la IP real del cliente. `0` en DEV, `1` con Nginx (Prod, es el valor por defecto), en Render el medido. Se da por bueno el número **más chico** con el que pasan las dos pruebas del script:
  - `XFF falso no cambia la clave` (si falla, el valor está alto: cualquiera se brinca el límite).
  - `la clave es la IP real` con `IP_REAL` (si falla, el valor está bajo: todos comparten el límite del proxy).

---

## 1. Demo en vivo

### 1.1 Los 2 tenants existentes

- Ventana normal: Barbería → Servicios, Clientes, Citas.
- Incógnito: Spa → lo mismo.
- Señalar: cortes y barba de un lado, masajes y faciales del otro.
- Decir:
  - _"Es la misma app, la misma URL y la misma base de datos."_
  - _"Cada negocio solo ve sus datos. No hay dos copias del sistema."_

### 1.2 Registrar un tenant nuevo en vivo

- Pantalla de Registro, datos sugeridos:

| Campo              | Valor                   |
| ------------------ | ----------------------- |
| Nombre del negocio | Taller Moto Veloz       |
| Tu nombre          | Carlos Ruiz             |
| Email              | admin@motoveloz.com     |
| Contraseña         | 12345678                |

- Email repetido → 409 con mensaje claro en la UI ("Ese correo ya está registrado").
- El registro **no pide teléfono**; el teléfono de 10 dígitos se valida al crear clientes (paso 1.3).
- Decir:
  - _"`POST /auth/register` crea el Tenant y su primer User en una sola escritura anidada de Prisma. Es todo o nada: no puede quedar un negocio sin usuario."_
  - _"Regresa un JWT con el `tenantId` del negocio nuevo y ya entro directo al dashboard."_

### 1.3 El tenant nuevo arranca vacío

- Servicios, Clientes, Citas: todo vacío.
- Decir: _"No ve nada de Barbería ni de Spa, y nadie configuró nada a mano."_
- Crear servicio con el **mismo nombre** que uno de Barbería:
  - Nombre: `Corte de cabello` · Duración: `30` · Precio: `150` → se crea ✅
- Decir: _"La unicidad del nombre es por negocio, no global. Barbería ya tiene un 'Corte de cabello' y no choca."_
- Bonus: crear otro igual en el mismo tenant, `corte de cabello` (minúsculas) → 409 "Ya existe un servicio con ese nombre".
  - _"Dentro del mismo negocio sí se bloquea, sin importar mayúsculas."_
- Bonus 2: crear cliente con el **mismo teléfono** que un cliente de Barbería:
  - Nombre: `Pedro Pérez` · Teléfono: `6641234567` → se crea ✅ (unicidad por tenant)
  - Teléfono `12345` → toast "El teléfono debe tener 10 dígitos." (lo frena el front; el backend también lo valida con 400).

### 1.4 Intento de acceso cruzado (curl)

- Decir: _"Ahora soy Barbería e intento modificar una cita del Spa con su ID."_
- Correr el comando del 0.3. Respuesta esperada:

```
HTTP/1.1 404 Not Found
{"error":"Cita no encontrada"}
```

- Decir: _"404, no 403. Para Barbería esa cita ni siquiera existe: no confirmo que el ID es real."_

**Bonus: mandar `tenantId` en el body**

```bash
curl -i -X PATCH $API/appointments/<ID_CITA_SPA>/estado \
  -H "Authorization: Bearer <TOKEN_BARBERIA>" \
  -H "Content-Type: application/json" \
  -d '{"estado":"CONFIRMADA","tenantId":"<ID_TENANT_SPA>"}'
```

- Esperado: lo mismo, `404 {"error":"Cita no encontrada"}`.
- Decir: _"La ruta solo lee `estado` del body. El `tenantId` sale del token, nunca del navegador."_

**Extra: sin token / token alterado**

```bash
curl -i $API/appointments
# 401 {"error":"Token no proporcionado"}

curl -i $API/appointments -H "Authorization: Bearer <TOKEN_BARBERIA>x"
# 401 {"error":"Token inválido o expirado"}
```

- Cierre: refrescar la ventana del Spa → la cita sigue igual.

---

## 2. Explicación técnica

### 2.1 Estrategia: esquema compartido + columna `tenantId`

- Una base, unas tablas; cada fila de negocio lleva `tenantId`.
- Analogía: **edificio de departamentos**.
  - Mismo edificio (BD), misma estructura (tablas).
  - Cada quien tiene su llave (JWT) y solo abre su depa (sus filas).
- Por qué esta y no las otras:

|                       | BD por tenant        | Esquema por tenant      | **Esquema compartido** ✅ |
| --------------------- | -------------------- | ----------------------- | ------------------------- |
| Costo                 | Una BD por negocio   | Una sola BD             | Una sola BD               |
| Alta de un negocio    | Crear BD + migrar    | Crear esquema + migrar  | Un `INSERT`               |
| Migraciones           | N veces              | N veces                 | **Una**                   |
| Aislamiento           | Físico (el más duro) | Por esquema             | Lógico, en la app         |

- Para negocios pequeños con pocos datos cada uno, gana simple y barato.
- Trade-off honesto: el aislamiento depende de que el código siempre filtre.

### 2.2 `server/prisma/schema.prisma`

- Mostrar `model Tenant`: tiene `users`, `services`, `clients`, `appointments`.
- Mostrar `tenantId` + `@relation` en `Service`, `Client`, `Appointment`, `User`.
- Señalar:
  - `Service` → `@@unique([tenantId, nombre])`
  - `Client` → `@@unique([tenantId, telefono])`
  - `User` → `email String @unique` (global, ver preguntas).
- Decir: _"La base misma garantiza que no haya duplicados dentro de un negocio, pero sí permite repetir entre negocios."_

### 2.3 El "gafete": JWT en `server/src/routes/auth.ts`

- `router.post("/register", ...)`:
  - `bcrypt.hash(password, 10)`.
  - `prisma.tenant.create` con `users: { create: ... }` adentro → Tenant + User juntos.
  - `jwt.sign({ userId, tenantId }, JWT_SECRET, { expiresIn: "7d" })`.
- `router.post("/login", ...)`:
  - `findUnique({ where: { email } })` → `bcrypt.compare` → mismo `jwt.sign`.
  - Mismo mensaje "Credenciales inválidas" si no existe el email o si falla el password: no revela cuál.
- Decir: _"El token es un gafete firmado: dice quién eres y de qué negocio. Si lo alteras, la firma ya no cuadra."_

### 2.4 El "guardia": `verificarToken` en `server/src/middleware/auth.ts`

- Sin header `Bearer` → 401 "Token no proporcionado".
- `jwt.verify(token, JWT_SECRET)` → si falla (firma o expiración) → 401 "Token inválido o expirado".
- Si pasa: `req.userId` y `req.tenantId` salen **del payload del token**.
- Se aplica con `router.use(verificarToken)` al inicio de `services.ts`, `clients.ts` y `appointments.ts`: ninguna ruta de negocio queda sin guardia.
- Decir: _"De aquí en adelante, el código ya sabe de qué negocio eres, y no hay forma de que el cliente se lo cambie."_

### 2.5 Las rutas: `where: { tenantId }` en todo

**`server/src/routes/appointments.ts`**

- `router.patch("/:id/estado", ...)` (el que atacamos en la demo):
  - `findFirst({ where: { id: req.params.id, tenantId } })` → si no es tuya, 404.
  - El `updateMany` final también lleva `tenantId` (y el estado leído, para no pisar cambios concurrentes).
- `router.post("/", ...)` → validación de choque de horario:
  - El servicio se busca con `tenantId`.
  - `candidatas` (citas que podrían chocar) se buscan con `tenantId` y `estado: { notIn: LIBERAN_HORARIO }`.
  - Si hay choque → 409 "Ya hay una cita en ese horario".
  - Decir: _"Barbería y Spa pueden tener citas a la misma hora: el choque solo se revisa dentro del mismo negocio."_

**`server/src/routes/services.ts`**

- `router.post("/", ...)`: el chequeo de duplicado (`existente`) filtra por `tenantId` + `mode: "insensitive"`.
- Respaldo: si aun así choca el `@@unique`, se atrapa el `P2002` → 409 con mensaje claro.
- `router.delete("/:id", ...)`: primero `findFirst` con `tenantId`, luego bloquea si tiene citas.

### 2.6 Extras de seguridad

- **bcrypt**: contraseñas con hash (costo 10), nunca en texto plano.
- **`.env` fuera del repo**: `.gitignore` lo excluye; en el repo solo está `server/.env.example` con placeholders.
- **`JWT_SECRET` distinto por entorno**: un token de Staging no sirve en Prod.
- **Entornos con BD separadas**: DEV (Docker), Staging (Postgres de Render), Prod (Postgres en la EC2). Cada una con negocios de prueba distintos (sección 5).

---

## 3. Preguntas probables

### ¿Y si se olvida el filtro en una query?

- Es el riesgo principal de este modelo, lo reconozco.
- Hoy: regla de equipo documentada (toda query filtra por `tenantId`, incluidas validaciones), `req.tenantId` siempre del token, y revisión de cada ruta.
- A futuro:
  - **Row-Level Security** en Postgres: la base rechaza filas de otro tenant aunque el código se equivoque.
  - O una **extensión de Prisma** (`$extends`) que agregue el `tenantId` automáticamente a cada query.
- **Ya pasó en el proyecto**: `POST /appointments` validaba que el `serviceId` fuera del tenant, pero el `clientId` se guardaba tal cual venía en el body. Con un token de Bella Vista se podía agendar una cita a un cliente de MotorPro.
  - Cómo se detectó: revisando ruta por ruta contra la regla de "toda query filtra por `tenantId`, incluidas validaciones".
  - Cómo se corrigió: `findFirst({ where: { id: clientId, tenantId } })` antes del `create`; si no es del tenant → 404 "Cliente no encontrado", igual que con el servicio. Se probó en Staging con curl (token de un negocio + cliente del otro → 404).

### ¿Por qué el email es único global?

- En el login solo llegan email y contraseña: todavía no sé de qué negocio eres.
- Con email único, el email me dice el usuario y el usuario me dice el tenant.

### ¿Qué pasa si alguien altera el JWT?

- Cambia el payload → la firma ya no coincide → `jwt.verify` falla → 401.
- Para firmar uno válido necesitas `JWT_SECRET`, que solo vive en el `.env` del servidor.
- Si roban un token válido: expira a los 7 días.

### ¿Cómo escala al agregar negocios?

- Un negocio nuevo = un `INSERT` en `Tenant` + uno en `User`. Cero infraestructura nueva.
- Una sola migración aplica a todos.
- Si crece mucho: índices por `tenantId`, réplicas de lectura, y en el extremo mover un tenant grande a su propia BD.

### ¿Por qué no BD por tenant?

- N bases = N conexiones, N migraciones, N backups.
- En el Learner Lab (1 EC2 de ~1 GB) y Render free no es viable.
- Para negocios chicos, el aislamiento lógico bien hecho alcanza; BD por tenant tiene sentido con clientes grandes o requisitos legales de separación.

---

## 4. Plan B

### Si el Learner Lab no prende o la EC2 falla

- Hacer la demo en **Staging**: https://citaflow-staging-web.onrender.com
- Credenciales: Salón Bella Vista / MotorPro Servicio (sección 5).
- Avisar: _"El primer request puede tardar ~1 min: Render free duerme el servicio sin tráfico (cold start)."_
- Abrir la URL **unos minutos antes** para despertarla.
- Para el curl: `API=https://citaflow-staging-api.onrender.com`. El resto de comandos es igual.
- ⚠️ La BD de Staging (Postgres free de Render) **expira el 26 de noviembre**: después de esa fecha este plan B no sirve hasta recrearla (migrate deploy + seed `staging`).
- Servicio con el mismo nombre en el paso 1.3: usar `Corte de dama` (existe en Salón Bella Vista).

### Si hay que redeployar Prod antes de la demo

- Si `free -h` dice `Swap: 0B` (una vez por instancia):

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

- Desplegar (como `ubuntu`, sin `sudo`). Nunca corre el seed:

```bash
~/citaflow/scripts/deploy-prod.sh
```

- ⚠️ **Antes de desplegar**: el `server/.env` de la EC2 necesita `CORS_ORIGIN="http://3.222.23.172"`; sin ella la API no arranca. `TRUST_PROXY` puede omitirse (vale 1 = Nginx).
- ⚠️ **Después de desplegar**: repetir con Nginx la prueba de `TRUST_PROXY` (sección 0.4). Desde tu máquina, no desde la EC2:

```bash
cd server && IP_REAL=$(curl -s -4 https://api.ipify.org) bash scripts/pruebas.sh <URL_API_PROD> prod
# Deben pasar "XFF falso no cambia la clave" y "la clave es la IP real". Si no, ajustar TRUST_PROXY en server/.env de la EC2.
```
- ⚠️ **Al montar la EC2 (o en la primera promoción después del cambio de contraseñas)** hay que correr el seed de Prod para que las cuentas usen `12345678` (sección 5). Borra y vuelve a sembrar la BD de Prod:

```bash
cd ~/citaflow/server && SEED_LABEL=prod npm run seed
```

---

## 5. Credenciales de la app

Solo existen si el seed se corrió en ese entorno.

### DEV — `npm run seed`

| Negocio                | Email              | Contraseña |
| ---------------------- | ------------------ | ---------- |
| Taller El Tornillo     | admin@tornillo.dev | 12345678   |
| Consultorio Dr. Prueba | admin@drprueba.dev | 12345678   |

### Staging — `SEED_LABEL=staging npm run seed`

| Negocio           | Email                 | Contraseña |
| ----------------- | --------------------- | ---------- |
| Salón Bella Vista | admin@bellavista.test | 12345678   |
| MotorPro Servicio | admin@motorpro.test   | 12345678   |

### Producción — `SEED_LABEL=prod npm run seed`

| Negocio           | Email              | Contraseña |
| ----------------- | ------------------ | ---------- |
| Barbería El Corte | admin@barberia.com | 12345678   |
| Spa Relax         | admin@sparelax.com | 12345678   |

Negocios distintos por entorno, a propósito: de un vistazo sabes en cuál estás.

### URLs

| Entorno    | URL                                       |
| ---------- | ----------------------------------------- |
| DEV        | http://localhost:5173                     |
| Staging    | https://citaflow-staging-web.onrender.com |
| Staging API | https://citaflow-staging-api.onrender.com |
| Producción | http://3.222.23.172                       |
