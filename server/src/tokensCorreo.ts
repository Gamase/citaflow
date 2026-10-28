import crypto from "node:crypto";
import { TipoTokenCorreo } from "@prisma/client";
import { enviarCorreo } from "./correo";
import { prisma } from "./db";

// Enlaces de un solo uso por correo: verificar el correo y restablecer la contraseña.
// - El token es aleatorio (32 bytes); en la BD solo va su sha256. Con una copia de la BD
//   no se puede usar ningún enlace.
// - Emitir uno nuevo invalida los anteriores del mismo tipo para ese usuario.
// - Consumirlo es atómico: un updateMany que exige "no usado y no vencido" y tiene que
//   afectar exactamente una fila (dos clics al mismo tiempo no lo usan dos veces).
// Usa el `prisma` base: TokenCorreo y User no tienen RLS y esto pasa antes de saber el
// negocio (abrir el enlace sin sesión, "olvidé").

const DURACION_MS: Record<TipoTokenCorreo, number> = {
  VERIFICACION: 24 * 60 * 60 * 1000,
  RESET: 60 * 60 * 1000,
};

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function emitirToken(userId: string, email: string, tipo: TipoTokenCorreo): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const ahora = new Date();
  await prisma.$transaction([
    prisma.tokenCorreo.updateMany({ where: { userId, tipo, usadoEn: null }, data: { usadoEn: ahora } }),
    prisma.tokenCorreo.create({
      data: { userId, email, tipo, hash: hashToken(token), expiraEn: new Date(ahora.getTime() + DURACION_MS[tipo]) },
    }),
  ]);
  return token;
}

// El usuario y el correo del token si es válido (existe, de ese tipo, sin usar y sin vencer);
// si no, null. Al regresarlo ya quedó marcado como usado.
export async function consumirToken(token: string, tipo: TipoTokenCorreo) {
  const registro = await prisma.tokenCorreo.findUnique({ where: { hash: hashToken(token) } });
  if (!registro || registro.tipo !== tipo) return null;

  const { count } = await prisma.tokenCorreo.updateMany({
    where: { id: registro.id, usadoEn: null, expiraEn: { gt: new Date() } },
    data: { usadoEn: new Date() },
  });
  return count === 1 ? { userId: registro.userId, email: registro.email } : null;
}

const frontend = () => (process.env.FRONTEND_URL as string).replace(/\/+$/, "");

export async function mandarVerificacion(user: { id: string; nombre: string; email: string }) {
  const token = await emitirToken(user.id, user.email, "VERIFICACION");
  return enviarCorreo({
    para: user.email,
    asunto: "Confirma tu correo en CitaFlow",
    parrafos: [`Hola, ${user.nombre}.`, "Confirma que este correo es tuyo para terminar de configurar tu cuenta de CitaFlow."],
    boton: { texto: "Confirmar mi correo", url: `${frontend()}/verificar?token=${token}` },
    pie: "El enlace vence en 24 horas. Si no creaste una cuenta en CitaFlow, ignora este correo.",
  });
}

export async function mandarRestablecer(user: { id: string; nombre: string; email: string }) {
  const token = await emitirToken(user.id, user.email, "RESET");
  return enviarCorreo({
    para: user.email,
    asunto: "Restablece tu contraseña de CitaFlow",
    parrafos: [`Hola, ${user.nombre}.`, "Alguien pidió restablecer la contraseña de tu cuenta de CitaFlow."],
    boton: { texto: "Poner una contraseña nueva", url: `${frontend()}/restablecer?token=${token}` },
    pie: "El enlace vence en 1 hora y sirve una sola vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.",
  });
}
