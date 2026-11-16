import crypto from "node:crypto";
import { Router, RequestHandler } from "express";
import { mandarRecordatorios } from "../avisosCita";
import { limiteTareas } from "../middleware/limites";

// Trabajos que dispara un cron externo (cron-job.org en Staging, crontab en la EC2): el server
// no lleva reloj propio porque en Render free se duerme. No hay sesión: se protege con un
// secreto compartido en el encabezado X-Cron-Secret (variable CRON_SECRET).
const router = Router();

// Sin CRON_SECRET el server arranca igual y estas rutas responden 503 (como Google sin configurar).
const conSecreto: RequestHandler = (req, res, next) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    res.status(503).json({ error: "Las tareas programadas no están configuradas." });
    return;
  }
  // Se comparan los sha256: mismo largo siempre, y timingSafeEqual no delata por tiempo.
  const hash = (s: string) => crypto.createHash("sha256").update(s).digest();
  if (!crypto.timingSafeEqual(hash(String(req.get("X-Cron-Secret") ?? "")), hash(secreto))) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  next();
};

// Manda los recordatorios de las citas que empiezan en las próximas 24 h. Se puede llamar
// cuantas veces sea: cada cita recibe a lo más uno (ver mandarRecordatorios).
router.post("/recordatorios", limiteTareas, conSecreto, async (_req, res) => {
  res.json(await mandarRecordatorios());
});

export default router;
