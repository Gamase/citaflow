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

// Login con Google: igual que el login (por IP, solo los fallidos), con su propio contador.
export const limiteGoogle = rateLimit({
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

// Reenviar el correo de verificación: por usuario (ya tiene sesión). Cuenta todos los
// intentos: cada uno manda un correo.
export const limiteReenvio = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => `usuario:${req.userId}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Ya te mandamos varios correos. Espera 15 minutos antes de pedir otro." },
});

// "Olvidé mi contraseña": por IP (quien prueba muchos correos) y por correo (quien llena el
// buzón de alguien). Responden igual exista o no la cuenta, así que no revelan nada.
export const limiteOlvideIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes desde esta red. Espera 15 minutos e intenta de nuevo." },
});

export const limiteOlvideCorreo = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  // Va después de validar(): el body ya trae el email limpio.
  keyGenerator: (req) => `correo:${String(req.body?.email ?? "").toLowerCase()}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Ya pediste varios enlaces para ese correo. Espera una hora e intenta de nuevo." },
});
