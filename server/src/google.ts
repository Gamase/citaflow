import crypto from "node:crypto";

// Verifica el ID token ("credential") que Google Identity Services le da al front. Sin
// dependencias: el token es un JWT firmado con RS256 por Google, y sus llaves públicas están
// en un JWKS público. Se revisa la firma aquí, sin llamar a Google en cada login.

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const EMISORES = new Set(["accounts.google.com", "https://accounts.google.com"]);
// Tolerancia por diferencia de reloj entre Google y este server, en segundos.
const MARGEN_RELOJ = 60;
// Un `kid` desconocido vuelve a pedir las llaves (Google las rota), pero como máximo una vez
// por minuto: si no, tokens con `kid` inventados harían que el server golpee a Google sin parar.
const ESPERA_ENTRE_DESCARGAS = 60_000;

export interface PerfilGoogle {
  sub: string;
  email: string;
  nombre: string;
}

let llaves = new Map<string, crypto.KeyObject>();
let vencenEn = 0;
let ultimaDescarga = 0;

async function descargarLlaves() {
  ultimaDescarga = Date.now();
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`el JWKS de Google respondió ${res.status}`);
  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const nuevas = new Map<string, crypto.KeyObject>();
  for (const jwk of keys) {
    if (jwk.kty === "RSA" && jwk.kid) nuevas.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
  }
  // Se guardan lo que diga Google (Cache-Control: max-age); sin ese dato, una hora.
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];
  vencenEn = Date.now() + (maxAge ? Number(maxAge) * 1000 : 3600_000);
  llaves = nuevas;
}

async function llavePublica(kid: string) {
  const toca = Date.now() >= vencenEn || !llaves.has(kid);
  // Si la descarga falla, se siguen usando las llaves que había.
  if (toca && Date.now() - ultimaDescarga >= ESPERA_ENTRE_DESCARGAS) await descargarLlaves();
  return llaves.get(kid);
}

function json(parte: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(parte, "base64url").toString("utf8")) as Record<string, unknown>;
}

// null si el token no sirve, por la razón que sea (la ruta responde un 401 genérico). La razón
// va al log, el token nunca.
export async function verificarCredencialGoogle(credential: string, clientId: string): Promise<PerfilGoogle | null> {
  try {
    const partes = credential.split(".");
    if (partes.length !== 3) throw new Error("no es un JWT");
    const [encabezado, contenido, firma] = partes as [string, string, string];

    // Solo RS256 con una llave de Google: así no pasan `alg: none` ni HS256 (confusión de algoritmos).
    const h = json(encabezado);
    if (h.alg !== "RS256" || typeof h.kid !== "string") throw new Error(`algoritmo no permitido: ${String(h.alg)}`);
    const llave = await llavePublica(h.kid);
    if (!llave) throw new Error("kid desconocido");
    const firmaValida = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${encabezado}.${contenido}`),
      llave,
      Buffer.from(firma, "base64url"),
    );
    if (!firmaValida) throw new Error("firma inválida");

    const c = json(contenido);
    const ahora = Math.floor(Date.now() / 1000);
    if (typeof c.iss !== "string" || !EMISORES.has(c.iss)) throw new Error("emisor no es Google");
    if (c.aud !== clientId) throw new Error("es para otra aplicación (aud)");
    if (typeof c.exp !== "number" || c.exp + MARGEN_RELOJ < ahora) throw new Error("vencido");
    if (c.email_verified !== true) throw new Error("Google no ha verificado ese correo");
    if (typeof c.sub !== "string" || typeof c.email !== "string") throw new Error("sin sub o email");

    const email = c.email.trim();
    const nombre = typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 100) : email.split("@")[0]!;
    return { sub: c.sub, email, nombre };
  } catch (err) {
    console.warn("Credencial de Google rechazada:", err instanceof Error ? err.message : err);
    return null;
  }
}
