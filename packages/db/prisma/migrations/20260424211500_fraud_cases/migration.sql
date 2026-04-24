-- Phase 9.2 — Fraud signals & case workflow

ALTER TABLE "scheduled_postings"
  ADD COLUMN "beneficiaryTenantUserId" TEXT;

CREATE INDEX "scheduled_postings_tenantId_beneficiaryTenantUserId_status_idx"
  ON "scheduled_postings"("tenantId", "beneficiaryTenantUserId", "status");

CREATE TABLE "risk_signals" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenantUserId" TEXT,
  "signalType" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "dedupeKey" TEXT,
  "sourceEventId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "risk_signals_tenantId_dedupeKey_key"
  ON "risk_signals"("tenantId", "dedupeKey");
CREATE INDEX "risk_signals_tenantId_createdAt_idx"
  ON "risk_signals"("tenantId", "createdAt");
CREATE INDEX "risk_signals_tenantUserId_createdAt_idx"
  ON "risk_signals"("tenantUserId", "createdAt");
CREATE INDEX "risk_signals_signalType_createdAt_idx"
  ON "risk_signals"("signalType", "createdAt");

CREATE TABLE "risk_cases" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenantUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "severity" TEXT NOT NULL,
  "scoreTotal" INTEGER NOT NULL,
  "thresholdSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resolution" TEXT,
  "resolutionNote" TEXT,
  "openedBySignalId" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "risk_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_cases_tenantId_status_openedAt_idx"
  ON "risk_cases"("tenantId", "status", "openedAt");
CREATE INDEX "risk_cases_tenantUserId_status_idx"
  ON "risk_cases"("tenantUserId", "status");
ALTER TABLE "risk_cases"
  ADD CONSTRAINT "risk_cases_openedBySignalId_fkey"
  FOREIGN KEY ("openedBySignalId") REFERENCES "risk_signals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "risk_case_events" (
  "id" TEXT NOT NULL,
  "riskCaseId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_case_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_case_events_riskCaseId_createdAt_idx"
  ON "risk_case_events"("riskCaseId", "createdAt");
ALTER TABLE "risk_case_events"
  ADD CONSTRAINT "risk_case_events_riskCaseId_fkey"
  FOREIGN KEY ("riskCaseId") REFERENCES "risk_cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reward_holds" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenantUserId" TEXT NOT NULL,
  "scheduledPostingId" TEXT NOT NULL,
  "riskCaseId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "reasonCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  CONSTRAINT "reward_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reward_holds_scheduledPostingId_key"
  ON "reward_holds"("scheduledPostingId");
CREATE INDEX "reward_holds_tenantId_status_createdAt_idx"
  ON "reward_holds"("tenantId", "status", "createdAt");
CREATE INDEX "reward_holds_tenantUserId_status_idx"
  ON "reward_holds"("tenantUserId", "status");
ALTER TABLE "reward_holds"
  ADD CONSTRAINT "reward_holds_riskCaseId_fkey"
  FOREIGN KEY ("riskCaseId") REFERENCES "risk_cases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
