import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import serviceRoutes from "./routes/services";
import clientRoutes from "./routes/clients";
import appointmentRoutes from "./routes/appointments";
import dashboardRoutes from "./routes/dashboard";
import userRoutes from "./routes/users";
import meRoutes from "./routes/me";
import tenantRoutes from "./routes/tenant";
import { manejarErrores } from "./middleware/errores";

// En DEV las variables vienen de server/.env; en Staging/Prod (Render, PM2) del entorno,
// y ahí no hay archivo. Las que ya existen en el entorno no se pisan.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan solo las variables del entorno.
}

// Sin estas el server no tiene sentido: no arranca.
for (const variable of ["JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN", "TRUST_PROXY"]) {
  if (!process.env[variable]) {
    console.error(`Falta la variable de entorno ${variable}. El servidor no arranca.`);
    process.exit(1);
  }
}

// Orígenes del front que pueden llamar a la API, separados por coma.
const origenesPermitidos = (process.env.CORS_ORIGIN as string)
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

const app = express();
const PORT = process.env.PORT || 3000;

// Cuántos proxies hay delante de la API, para que Express (y el rate limit) tome la IP
// real del cliente de X-Forwarded-For. 0 en DEV (sin proxy), 1 con Nginx (Prod), 3 en Render
// (medido, ver DEMO.md). Nunca `true`: cualquiera podría falsear su IP y saltarse el límite.
const trustProxy = Number(process.env.TRUST_PROXY);
if (!Number.isInteger(trustProxy) || trustProxy < 0) {
  console.error("TRUST_PROXY debe ser un entero >= 0. El servidor no arranca.");
  process.exit(1);
}
app.set("trust proxy", trustProxy);

app.use(helmet());
app.use(cors({ origin: origenesPermitidos }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/services", serviceRoutes);
app.use("/clients", clientRoutes);
app.use("/appointments", appointmentRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/users", userRoutes);
app.use("/me", meRoutes);
app.use("/tenant", tenantRoutes);

app.use(manejarErrores);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
