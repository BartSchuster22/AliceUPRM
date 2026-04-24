-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "destinationCurrency" TEXT,
    "payoutMethod" TEXT NOT NULL,
    "destination" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "failureReason" TEXT,
    "externalPayoutId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_requests_tenantId_tenantUserId_createdAt_idx" ON "payout_requests"("tenantId", "tenantUserId", "createdAt");

-- CreateIndex
CREATE INDEX "payout_requests_status_createdAt_idx" ON "payout_requests"("status", "createdAt");
