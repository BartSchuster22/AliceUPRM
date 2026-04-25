-- CreateTable
CREATE TABLE "settlement_cycles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "ledgerLiabilityMinor" BIGINT NOT NULL DEFAULT 0,
    "pendingLiabilityMinor" BIGINT NOT NULL DEFAULT 0,
    "totalLiabilityMinor" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "openedByAdminId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByAdminId" TEXT,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_cycles_tenantId_status_openedAt_idx" ON "settlement_cycles"("tenantId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "settlement_cycles_tenantId_periodStart_periodEnd_idx" ON "settlement_cycles"("tenantId", "periodStart", "periodEnd");
