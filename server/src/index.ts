import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import serviceRoutes from "./routes/services";
import clientRoutes from "./routes/clients";
import appointmentRoutes from "./routes/appointments";
import { manejarErrores } from "./middleware/errores";

// En DEV las variables vienen de server/.env; en Staging/Prod (Render, PM2) del entorno,
// y ahí no hay archivo. Las que ya existen en el entorno no se pisan.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan solo las variables del entorno.
}

// Sin estas el server no tiene sentido: no arranca.
for (const variable of ["JWT_SECRET", "DATABASE_URL", "CORS_ORIGIN"]) {
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

// Delante hay exactamente un proxy (balanceador de Render o Nginx): la IP real del
// cliente es la que ese proxy agrega a X-Forwarded-For. Con `true` cualquiera podría
// falsearla y saltarse el rate limit.
app.set("trust proxy", 1);

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

app.use(manejarErrores);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
