-- Avisos por correo de las citas: dos columnas opcionales, compatibles con el código viejo.

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "emailAviso" TEXT,
ADD COLUMN     "recordatorioEnviadoEn" TIMESTAMP(3);

