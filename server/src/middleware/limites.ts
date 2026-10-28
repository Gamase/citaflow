import { rateLimit } from "express-rate-limit";

// Límites por IP en las rutas públicas de auth, y por usuario al confirmar la contraseña actual. Mandan los encabezados estándar
// RateLimit / RateLimit-Policy para que el cliente sepa cuánto le queda.

// Login: cuenta solo intentos fallidos. Frena a quien prueba contraseñas
// sin castigar a quien entra bien.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesión. Espera 15 minutos e intenta de nuevo." },
});

// Register: cuenta solo registros exitosos. El abuso es crear negocios en masa;
// los errores de validación no cuentan. 10 por hora: en la escuela muchos comparten IP.
export const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  skipFailedRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Se alcanzó el límite de registros desde esta red. Intenta de nuevo en una hora." },
});

// Contraseña actual (cambiar contraseña o email desde Ajustes): por usuario y no por IP,
// porque el riesgo es una sesión robada probando contraseñas, aunque cambie de IP.
// Solo cuentan los intentos con la contraseña actual incorrecta (la ruta lo marca en
// res.locals); un email repetido o un dato mal escrito no gastan intentos.
export const limiteContrasena = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `usuario:${req.userId}`,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => !res.locals.passwordIncorrecta,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos con la contraseña actual. Espera 15 minutos e intenta de nuevo." },
});
