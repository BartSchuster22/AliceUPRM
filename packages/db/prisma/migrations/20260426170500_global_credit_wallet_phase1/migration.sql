-- AlterTable
ALTER TABLE "payout_requests"
ADD COLUMN "userId" TEXT,
ADD COLUMN "walletAccountId" TEXT,
ADD COLUMN "amountCredits" BIGINT,
ADD COLUMN "issuerBreakdownJson" JSONB,
ADD COLUMN "fxQuoteId" TEXT;

-- AlterTable
ALTER TABLE "settlement_cycles"
ADD COLUMN "fundedWalletLiabilityCredits" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "pendingRewardLiabilityCredits" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "payoutReservedLiabilityCredits" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "crossTenantReceivableCredits" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "crossTenantPayableCredits" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "netSettlementPositionCredits" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "displayEurMinor" BIGINT,
ADD COLUMN "settlementVersion" TEXT NOT NULL DEFAULT 'v2';

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_grants" (
    "id" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "issuerTenantId" TEXT,
    "sourceTenantUserId" TEXT,
    "originType" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "sourceReferenceType" TEXT,
    "sourceReferenceId" TEXT,
    "amountIssued" BIGINT NOT NULL,
    "amountRemaining" BIGINT NOT NULL,
    "fxQuoteId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_redemptions" (
    "id" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "spendingTenantId" TEXT NOT NULL,
    "spendingTenantUserId" TEXT,
    "purchaseRef" TEXT,
    "orderRef" TEXT,
    "amountCredits" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_redemption_allocations" (
    "id" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "walletGrantId" TEXT NOT NULL,
    "issuerTenantId" TEXT,
    "amountCredits" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_redemption_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_payout_reservations" (
    "id" TEXT NOT NULL,
    "walletAccountId" TEXT NOT NULL,
    "issuerTenantId" TEXT,
    "payoutRequestId" TEXT NOT NULL,
    "amountCredits" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_payout_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_payout_allocations" (
    "id" TEXT NOT NULL,
    "walletPayoutReservationId" TEXT NOT NULL,
    "walletGrantId" TEXT NOT NULL,
    "issuerTenantId" TEXT,
    "amountCredits" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_payout_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_clearing_entries" (
    "id" TEXT NOT NULL,
    "issuerTenantId" TEXT,
    "counterpartyTenantId" TEXT,
    "platformSide" TEXT,
    "flowType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amountCredits" BIGINT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_clearing_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_quotes" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rateDecimal" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceReferenceType" TEXT,
    "sourceReferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_requests_userId_createdAt_idx" ON "payout_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payout_requests_walletAccountId_createdAt_idx" ON "payout_requests"("walletAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_userId_currency_key" ON "wallet_accounts"("userId", "currency");

-- CreateIndex
CREATE INDEX "wallet_accounts_status_createdAt_idx" ON "wallet_accounts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_grants_walletAccountId_createdAt_idx" ON "wallet_grants"("walletAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_grants_issuerTenantId_createdAt_idx" ON "wallet_grants"("issuerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_grants_originType_createdAt_idx" ON "wallet_grants"("originType", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_grants_sourceEventId_idx" ON "wallet_grants"("sourceEventId");

-- CreateIndex
CREATE INDEX "wallet_redemptions_walletAccountId_createdAt_idx" ON "wallet_redemptions"("walletAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_redemptions_spendingTenantId_createdAt_idx" ON "wallet_redemptions"("spendingTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_redemptions_status_createdAt_idx" ON "wallet_redemptions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_redemption_allocations_redemptionId_idx" ON "wallet_redemption_allocations"("redemptionId");

-- CreateIndex
CREATE INDEX "wallet_redemption_allocations_walletGrantId_idx" ON "wallet_redemption_allocations"("walletGrantId");

-- CreateIndex
CREATE INDEX "wallet_redemption_allocations_issuerTenantId_createdAt_idx" ON "wallet_redemption_allocations"("issuerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_payout_reservations_walletAccountId_createdAt_idx" ON "wallet_payout_reservations"("walletAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_payout_reservations_payoutRequestId_idx" ON "wallet_payout_reservations"("payoutRequestId");

-- CreateIndex
CREATE INDEX "wallet_payout_reservations_issuerTenantId_createdAt_idx" ON "wallet_payout_reservations"("issuerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_payout_allocations_walletPayoutReservationId_idx" ON "wallet_payout_allocations"("walletPayoutReservationId");

-- CreateIndex
CREATE INDEX "wallet_payout_allocations_walletGrantId_idx" ON "wallet_payout_allocations"("walletGrantId");

-- CreateIndex
CREATE INDEX "wallet_payout_allocations_issuerTenantId_createdAt_idx" ON "wallet_payout_allocations"("issuerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_clearing_entries_issuerTenantId_createdAt_idx" ON "tenant_clearing_entries"("issuerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_clearing_entries_counterpartyTenantId_createdAt_idx" ON "tenant_clearing_entries"("counterpartyTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_clearing_entries_status_createdAt_idx" ON "tenant_clearing_entries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_clearing_entries_flowType_createdAt_idx" ON "tenant_clearing_entries"("flowType", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_clearing_entries_referenceType_referenceId_idx" ON "tenant_clearing_entries"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "fx_quotes_baseCurrency_quoteCurrency_effectiveAt_idx" ON "fx_quotes"("baseCurrency", "quoteCurrency", "effectiveAt");

-- CreateIndex
CREATE INDEX "fx_quotes_provider_effectiveAt_idx" ON "fx_quotes"("provider", "effectiveAt");

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_grants" ADD CONSTRAINT "wallet_grants_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_redemptions" ADD CONSTRAINT "wallet_redemptions_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_redemption_allocations" ADD CONSTRAINT "wallet_redemption_allocations_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "wallet_redemptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_redemption_allocations" ADD CONSTRAINT "wallet_redemption_allocations_walletGrantId_fkey" FOREIGN KEY ("walletGrantId") REFERENCES "wallet_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_payout_reservations" ADD CONSTRAINT "wallet_payout_reservations_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_payout_allocations" ADD CONSTRAINT "wallet_payout_allocations_walletPayoutReservationId_fkey" FOREIGN KEY ("walletPayoutReservationId") REFERENCES "wallet_payout_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_payout_allocations" ADD CONSTRAINT "wallet_payout_allocations_walletGrantId_fkey" FOREIGN KEY ("walletGrantId") REFERENCES "wallet_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
