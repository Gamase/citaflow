/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,telefono]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,nombre]` on the table `Service` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_telefono_key" ON "Client"("tenantId", "telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_nombre_key" ON "Service"("tenantId", "nombre");
