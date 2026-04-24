-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "tenantUserId" TEXT,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_postings" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_postings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "postAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "resultEntryId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_postings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_accounts_tenantId_currency_idx" ON "ledger_accounts"("tenantId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_tenantId_accountType_tenantUserId_currency_key" ON "ledger_accounts"("tenantId", "accountType", "tenantUserId", "currency");

-- CreateIndex
CREATE INDEX "ledger_entries_tenantId_createdAt_idx" ON "ledger_entries"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_sourceEventId_idx" ON "ledger_entries"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_tenantId_idempotencyKey_key" ON "ledger_entries"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_postings_accountId_createdAt_idx" ON "ledger_postings"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_postings_entryId_idx" ON "ledger_postings"("entryId");

-- CreateIndex
CREATE INDEX "scheduled_postings_status_postAt_idx" ON "scheduled_postings"("status", "postAt");

-- CreateIndex
CREATE INDEX "scheduled_postings_sourceEventId_idx" ON "scheduled_postings"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_postings_tenantId_idempotencyKey_key" ON "scheduled_postings"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
