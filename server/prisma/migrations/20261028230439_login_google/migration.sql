-- Login con Google. Compatible con el código viejo (que sigue sirviendo durante el build de
-- Render): una columna nueva opcional, y password opcional cuando aún no hay usuarios sin ella.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

