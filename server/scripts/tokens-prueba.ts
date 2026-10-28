// Helper de pruebas.sh para los enlaces por correo: como en DEV el correo va a la consola (y en
// Staging a un buzón real), el script no puede "leer" el enlace. En lugar de eso, este helper
// crea tokens conocidos directo en la BD (con la misma lógica que la API: solo se guarda el
// sha256) y le pasa el token en claro al script. Ningún endpoint de la API expone tokens.
//
// Uso (desde server/), imprime el resultado en stdout:
//   npx tsx scripts/tokens-prueba.ts userid  <email>             → id del usuario ("" si no existe)
//   npx tsx scripts/tokens-prueba.ts emitir  <email> <TIPO>      → token nuevo (invalida los anteriores)
//   npx tsx scripts/tokens-prueba.ts vencido <email> <TIPO>      → token ya vencido
//   npx tsx scripts/tokens-prueba.ts contar  <email> <TIPO>      → cuántos tokens de ese tipo tiene
//   TIPO: VERIFICACION | RESET
//
// BD: DATABASE_URL del entorno. Solo con USAR_ENV_DE_DEV=1 (pruebas.sh lo pone en `dev`) la
// toma de server/.env: así nunca escribe en la BD local por error cuando se prueba Staging.
// Sale con código 2 si no hay BD.

import crypto from "node:crypto";

async function main() {
  if (!process.env.DATABASE_URL && process.env.USAR_ENV_DE_DEV === "1") {
    try {
      process.loadEnvFile();
    } catch {
      // Sin .env.
    }
  }
  if (!process.env.DATABASE_URL) {
    console.error("Sin DATABASE_URL");
    process.exit(2);
  }

  const [comando, email, tipoTexto] = process.argv.slice(2);
  // Después de fijar DATABASE_URL: db.ts crea el PrismaClient al importarse.
  const { prisma } = await import("../src/db");
  const { emitirToken, hashToken } = await import("../src/tokensCorreo");

  try {
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (comando === "userid") {
      console.log(user?.id ?? "");
      return;
    }
    const tipo = tipoTexto === "RESET" ? "RESET" : "VERIFICACION";
    if (!user) throw new Error(`No existe el usuario ${email}`);

    if (comando === "emitir") {
      console.log(await emitirToken(user.id, user.email, tipo));
    } else if (comando === "vencido") {
      const token = crypto.randomBytes(32).toString("base64url");
      await prisma.tokenCorreo.create({
        data: { userId: user.id, email: user.email, tipo, hash: hashToken(token), expiraEn: new Date(Date.now() - 60_000) },
      });
      console.log(token);
    } else if (comando === "contar") {
      console.log(await prisma.tokenCorreo.count({ where: { userId: user.id, tipo } }));
    } else {
      throw new Error(`Comando desconocido: ${comando}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
