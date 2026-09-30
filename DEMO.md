# Guion de Demo — CitaFlow

## Credenciales de prueba (distintas por entorno — a propósito, para no confundirse)

Cada entorno se siembra con `SEED_LABEL` (default `dev` si no se especifica):

```bash
npm run seed                          # DEV (local)
SEED_LABEL=staging npm run seed       # STAGING (usando External Database URL de Render)
SEED_LABEL=prod npm run seed          # PRODUCCIÓN (corriendo por SSH en la EC2)
```

### DEV (local)

| Negocio                | Email              | Password |
| ---------------------- | ------------------ | -------- |
| Taller El Tornillo     | admin@tornillo.dev | 123456   |
| Consultorio Dr. Prueba | admin@drprueba.dev | 123456   |

### STAGING (Render)

| Negocio           | Email                 | Password |
| ----------------- | --------------------- | -------- |
| Salón Bella Vista | admin@bellavista.test | 123456   |
| MotorPro Servicio | admin@motorpro.test   | 123456   |

### PRODUCCIÓN (AWS EC2) — las que se usan en la demo real

| Negocio           | Email              | Password |
| ----------------- | ------------------ | -------- |
| Barbería El Corte | admin@barberia.com | 123456   |
| Spa Relax         | admin@sparelax.com | 654321   |

---

## Parte 1 — Desarrollo (DEV) — ~8 min

### 1.1 Mapa del proyecto (1 min)

Mostrar en VS Code: `server/` (routes, middleware, prisma), `client/` (pages, api),
`docker-compose.yml`, `.github/workflows/ci.yml`. Mencionar que `.env` nunca se sube a Git.

### 1.2 Base de datos desde cero (2 min)

```bash
docker compose down -v
docker compose up -d
cd server
npx prisma migrate deploy
npm run seed   # siembra el dataset "dev" (Taller El Tornillo / Consultorio Dr. Prueba)
```

Verificar aislamiento por tenant directo en la base:

```bash
docker exec -it citaflow-postgres-1 psql -U citaflow_user -d citaflow_db -P pager=off \
  -c 'SELECT "tenantId", count(*) FROM "Service" GROUP BY "tenantId";'
```

### 1.3 Levantar todo (1 min)

```bash
# Terminal 1
cd server && npm run dev
# Terminal 2
cd client && npm run dev
```

Confirmar: `curl localhost:3000/health` → abrir `localhost:5173`

### 1.4 Cómo funciona por dentro (3 min)

- `middleware/auth.ts` → extrae `tenantId` del JWT
- `routes/services.ts` → línea clave: `where: { tenantId: req.tenantId }`
- DevTools → Network → header `Authorization: Bearer ...`
- (Opcional) pegar un token en jwt.io para mostrar el payload

### 1.5 Hot reload + push (1 min)

Cambiar un texto en `Login.tsx` → se recarga solo.

```bash
git add . && git commit -m "Demo: cambio de texto" && git push
```

_(Este push corre en paralelo mientras se explica Staging — para cuando llegues ahí, el deploy ya terminó.)_

---

## Parte 2 — Staging — ~3 min

1. GitHub → pestaña Actions → mostrar el workflow en verde
2. Render → `citaflow-staging-api` → Deploys → mostrar el deploy automático
3. Abrir `https://citaflow-staging-web.onrender.com` → mostrar el cambio ya reflejado
4. Login con `admin@bellavista.test` / `123456` → mostrar que los datos son distintos a los de DEV y PROD
5. Render → pestaña Environment → mostrar los _nombres_ de las variables (nunca revelar valores)

---

## Parte 3 — Producción — ~3 min

En la Terminal 3 (SSH ya conectado, como `ubuntu`, **sin** `sudo`):

```bash
~/citaflow/scripts/deploy-prod.sh
```

Abrir `http://3.222.23.172` → mostrar el cambio ya en producción.
**Este paso manual ES el "gate" de aprobación entre Staging y Producción — señalarlo explícitamente.**

### Qué hace `scripts/deploy-prod.sh`

Se detiene en el primer error y no toca nada si falla alguna verificación previa.

| Paso | Comando | Por qué |
| ---- | ------- | ------- |
| 0. Verificaciones | rama `main`, sin cambios locales, existen `server/.env` y `VITE_API_URL` en `client/.env.production`, PM2 tiene `citaflow-api` | Falla antes de tocar producción |
| 1. Código | `git pull --ff-only origin main` | Solo avanza; nunca crea un merge en el servidor |
| 2. Backend | `npm ci` + `npx prisma generate` | `npm ci` respeta el lockfile y no lo modifica |
| 3. Frontend | `npm ci` + `npm run build` | Se compila antes de tocar la base o el backend: si falla (p. ej. falta `VITE_API_URL`), producción queda intacta |
| 4. Migraciones | `npx prisma migrate deploy` | Aplica migraciones pendientes. **Nunca corre el seed** |
| 5. Reinicio | `pm2 restart citaflow-api` + `curl localhost:3000/health` | Si el backend no responde en 20 s, se detiene |
| 6. Publicar | vacía `/var/www/html` y copia `client/dist/` | Queda exactamente el build nuevo, sin assets viejos |

Si se detiene: el mensaje dice qué paso falló. Para el backend, `pm2 logs citaflow-api`.

### Tabla comparativa (mostrar o mencionar de memoria)

|                 | Dev                                         | Staging                      | Producción                    |
| --------------- | ------------------------------------------- | ---------------------------- | ----------------------------- |
| Corre en        | Máquina local                               | Render                       | EC2 (AWS Academy)             |
| Base de datos   | Postgres en Docker                          | Postgres de Render           | Postgres nativo en la EC2     |
| Despliegue      | `npm run dev`                               | Automático (push a main)     | Manual (`deploy-prod.sh`)     |
| Datos de prueba | Taller El Tornillo / Consultorio Dr. Prueba | Salón Bella Vista / MotorPro | Barbería El Corte / Spa Relax |

---

## Parte 4 — Multitenencia y reglas de negocio — ~3 min

(Hacer esto en Producción para que la demo final sea la "real")

1. Login con `admin@barberia.com` / `123456` → mostrar sus servicios/clientes/citas
2. Cerrar sesión → login con `admin@sparelax.com` / `654321` → **misma app, misma base de datos, cero datos de la barbería**
3. Agendar una cita a la misma fecha/hora que una ya existente → mostrar el bloqueo por choque de horario
4. Repetir un teléfono de cliente ya existente → mostrar el bloqueo por duplicado
5. Intentar eliminar un servicio con citas asociadas → mostrar el bloqueo

---

## Plan B (si algo falla)

- **Producción no responde** → usar Staging, explicar que el Learner Lab es efímero por diseño (esa es justo la razón de tener Staging)
- **Staging tarda en cargar** → es el cold start del free tier de Render, ya está anticipado
- **Sin internet en el salón** → tener un video de 2-3 min grabado de antemano con todo el flujo funcionando

---

## Preguntas esperadas

**¿Por qué el puerto 3000 está abierto sin HTTPS?**
Decisión de simplicidad para el entorno del laboratorio. En producción real iría todo detrás de Nginx con certificado TLS, exponiendo solo 80/443.

**¿Por qué Producción no se despliega automáticamente como Staging?**
El Learner Lab cambia credenciales y se apaga cada sesión; no hay un destino fijo al que automatizar. El gate manual es además una práctica común antes de un release crítico.

**¿Cómo se evita que un negocio vea datos de otro?**
El `tenantId` viene firmado dentro del JWT, nunca se confía en lo que mande el cliente. Cada consulta a la base de datos filtra explícitamente por ese campo.

**¿Qué pasa si el JWT es robado?**
Expira a los 7 días; el secreto de firma (`JWT_SECRET`) es distinto en cada entorno y nunca se sube al repositorio.

**¿Por qué cada entorno tiene negocios de prueba distintos?**
Para poder confirmar de un vistazo, sin leer la URL, en qué entorno estás parado — y para demostrar que las bases de datos están genuinamente aisladas entre sí, no solo separadas "de nombre".

---

## Notas de un bug real que encontramos y corregimos (útil para la defensa)

Durante las pruebas, `client/src/api/client.ts` tenía la URL del backend escrita fija en el código
(`http://localhost:3000`) en vez de leerla de una variable de entorno. Esto hacía que los builds
de Staging y Producción también apuntaran a `localhost`, y al abrirlos desde la misma máquina
que tenía el backend local corriendo, parecía (incorrectamente) que los tres entornos compartían
datos. Las bases de datos nunca se mezclaron — el navegador simplemente mandaba las peticiones
a la máquina local por la URL fija. Se corrigió usando `import.meta.env.VITE_API_URL` en build,
con el fallback a `localhost` solo en modo desarrollo, y se agregó una validación en
`vite.config.ts` que detiene el build si la variable falta o sigue apuntando a `localhost`.
Buen ejemplo real de por qué la paridad y el aislamiento de configuración entre entornos importa.

---

## Pendientes a verificar antes de la defensa

- [x] Crear `server/.env.example` con placeholders
- [x] Confirmar que `git pull` en la EC2 no choca por `package-lock.json` modificado
- [x] Reiniciar la instancia EC2 una vez (`sudo reboot`) y confirmar que PM2 + Nginx arrancan solos
- [x] Corregir la URL hardcodeada del backend en el frontend (bug real encontrado)
- [ ] Sembrar Staging con `SEED_LABEL=staging` usando la External Database URL de Render
- [ ] Sembrar Producción con `SEED_LABEL=prod` por SSH en la EC2
- [ ] Confirmar en DevTools → Network que los 3 entornos hablan cada uno con su propio backend (nunca con localhost)
- [ ] Ensayar el `docker compose down -v` + seed completo al menos una vez de corrido, cronometrando el tiempo real
