-- Verificación de correo y "Olvidé mi contraseña".
-- Compatible con el código viejo durante el build: la columna es opcional y la tabla es
-- nueva (el código viejo no la usa). El register viejo crea usuarios sin verificar: no rompe.
-- TokenCorreo sin RLS, como User: se usa antes de saber el negocio.

-- CreateEnum
CREATE TYPE "TipoTokenCorreo" AS ENUM ('VERIFICACION', 'RESET');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificado" TIMESTAMP(3);

-- Los usuarios que ya existen quedan verificados (desde que se crearon): la verificación
-- es para las cuentas nuevas.
UPDATE "User" SET "emailVerificado" = "creadoEn" WHERE "emailVerificado" IS NULL;

-- CreateTable
CREATE TABLE "TokenCorreo" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTokenCorreo" NOT NULL,
    "hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TokenCorreo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenCorreo_hash_key" ON "TokenCorreo"("hash");

-- CreateIndex
CREATE INDEX "TokenCorreo_userId_tipo_idx" ON "TokenCorreo"("userId", "tipo");

-- AddForeignKey
ALTER TABLE "TokenCorreo" ADD CONSTRAINT "TokenCorreo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
