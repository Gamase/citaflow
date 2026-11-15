-- Horario de apertura del negocio. Compatible con el código viejo (sigue sirviendo durante el
-- build de Render): una tabla nueva y una columna con default; nadie las usa hasta el deploy.
-- Un negocio sin filas en HorarioDia no restringe horarios: los existentes siguen igual.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Tijuana';

-- CreateTable
CREATE TABLE "HorarioDia" (
    "id" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "abreMin" INTEGER NOT NULL,
    "cierraMin" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "HorarioDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HorarioDia_tenantId_diaSemana_key" ON "HorarioDia"("tenantId", "diaSemana");

-- AddForeignKey
ALTER TABLE "HorarioDia" ADD CONSTRAINT "HorarioDia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS, igual que en Service, Client y Appointment (ver la migración rls_por_negocio).
ALTER TABLE "HorarioDia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HorarioDia" FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_por_negocio ON "HorarioDia"
  FOR ALL
  USING ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true) OR current_setting('app.bypass_rls', true) = 'on');
