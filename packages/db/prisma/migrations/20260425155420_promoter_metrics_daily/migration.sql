-- CreateTable
CREATE TABLE "promoter_metrics_daily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "newPaidReferralsCount" INTEGER NOT NULL DEFAULT 0,
    "grossRevenueReferred" BIGINT NOT NULL DEFAULT 0,
    "netRewardGenerated" BIGINT NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promoter_metrics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promoter_metrics_daily_tenantId_date_idx" ON "promoter_metrics_daily"("tenantId", "date");

-- CreateIndex
CREATE INDEX "promoter_metrics_daily_tenantUserId_date_idx" ON "promoter_metrics_daily"("tenantUserId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "promoter_metrics_daily_tenantId_tenantUserId_date_key" ON "promoter_metrics_daily"("tenantId", "tenantUserId", "date");
