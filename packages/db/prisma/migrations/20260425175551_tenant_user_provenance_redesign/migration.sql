-- AlterTable
ALTER TABLE "tenant_users" ADD COLUMN     "entityType" TEXT NOT NULL DEFAULT 'person',
ADD COLUMN     "sourceTenantId" TEXT,
ADD COLUMN     "sourceTenantUserId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "isSystemTenant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownerTenantUserId" TEXT,
ADD COLUMN     "sourceTenantId" TEXT,
ADD COLUMN     "sourceTenantUserId" TEXT;

-- CreateIndex
CREATE INDEX "tenant_users_sourceTenantId_idx" ON "tenant_users"("sourceTenantId");

-- CreateIndex
CREATE INDEX "tenant_users_sourceTenantUserId_idx" ON "tenant_users"("sourceTenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_ownerTenantUserId_key" ON "tenants"("ownerTenantUserId");

-- CreateIndex
CREATE INDEX "tenants_sourceTenantId_idx" ON "tenants"("sourceTenantId");

-- CreateIndex
CREATE INDEX "tenants_sourceTenantUserId_idx" ON "tenants"("sourceTenantUserId");

