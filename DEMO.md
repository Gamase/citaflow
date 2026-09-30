## Demo CitaFlow

## Credenciales de prueba

| Negocio           | Email              | Password |
| ----------------- | ------------------ | -------- |
| Barbería El Corte | admin@barberia.com | 123456   |
| Spa Relax         | admin@sparelax.com | 654321   |

---

## Parte 1 — Desarrollo (DEV) — ~8 min

### 1.1 Base de datos desde cero (2 min)

```bash
docker compose down -v
docker compose up -d
cd server
npx prisma migrate deploy
npm run seed
```

Verificar aislamiento por tenant directo en la base:

```bash
docker exec -it citaflow-postgres-1 psql -U citaflow_user -d citaflow_db -P pager=off \
  -c 'SELECT "tenantId", count(*) FROM "Service" GROUP BY "tenantId";'
```

### 1.2 Levantar todo (1 min)

```bash
# Terminal 1
cd server && npm run dev
# Terminal 2
cd client && npm run dev
```

Confirmar: `curl localhost:3000/health` → abrir `localhost:5173`


## Parte 2 — Staging — ~3 min

1. GitHub → pestaña Actions → mostrar el workflow en verde
2. Render → `citaflow-staging-api` → Deploys → mostrar el deploy automático
3. Abrir `https://citaflow-staging-web.onrender.com` → mostrar el cambio ya reflejado
4. Render → pestaña Environment → mostrar los _nombres_ de las variables (nunca revelar valores)

---

## Parte 3 — Producción — ~3 min

En la Terminal 3 (SSH ya conectado):

```bash
cd ~/citaflow && git pull
cd client && npm run build && sudo cp -r dist/* /var/www/html/
# si el cambio también tocó el backend:
pm2 restart citaflow-api
```

Abrir `http://3.222.23.172` → mostrar el cambio ya en producción.
**Este paso manual ES el "gate" de aprobación entre Staging y Producción — señalarlo explícitamente.**

### Tabla comparativa (mostrar o mencionar de memoria)

|               | Dev                | Staging                  | Producción                  |
| ------------- | ------------------ | ------------------------ | --------------------------- |
| Corre en      | Máquina local      | Render                   | EC2 (AWS Academy)           |
| Base de datos | Postgres en Docker | Postgres de Render       | Postgres nativo en la EC2   |
| Despliegue    | `npm run dev`      | Automático (push a main) | Manual (`git pull` + build) |

---

