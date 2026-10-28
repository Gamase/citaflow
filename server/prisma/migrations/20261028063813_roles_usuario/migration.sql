-- Roles de usuario: DUENO y EMPLEADO, y usuarios activos/inactivos.
-- Editada a mano (prisma migrate dev --create-only): Prisma no puede agregar una
-- columna obligatoria sin default a una tabla con datos.

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('DUENO', 'EMPLEADO');

-- AlterTable
-- Los usuarios que ya existen son quienes registraron su negocio: quedan como DUENO.
ALTER TABLE "User" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rol" "Rol" NOT NULL DEFAULT 'DUENO';

-- Y se quita el default: de aquí en adelante, quien crea un usuario dice su rol
-- (igual que en schema.prisma, que no tiene @default en `rol`).
ALTER TABLE "User" ALTER COLUMN "rol" DROP DEFAULT;
