import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import serviceRoutes from "./routes/services";
import clientRoutes from "./routes/clients";
import appointmentRoutes from "./routes/appointments";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/services", serviceRoutes);
app.use("/clients", clientRoutes);
app.use("/appointments", appointmentRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
