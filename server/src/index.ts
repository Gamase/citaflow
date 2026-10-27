import express from "express";
import cors from "cors";
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

// Sin estas dos el server no tiene sentido: no arranca.
for (const variable of ["JWT_SECRET", "DATABASE_URL"]) {
  if (!process.env[variable]) {
    console.error(`Falta la variable de entorno ${variable}. El servidor no arranca.`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
