-- Phase 9.3 — Reporting & analytics read models

CREATE TABLE "conversion_daily" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventCount" INTEGER NOT NULL,
  "distinctExternalUsers" INTEGER NOT NULL,
  "distinctTenantUsers" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversion_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversion_daily_tenantId_day_eventType_key"
  ON "conversion_daily"("tenantId", "day", "eventType");
CREATE INDEX "conversion_daily_tenantId_day_idx"
  ON "conversion_daily"("tenantId", "day");

CREATE TABLE "reward_performance_daily" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL,
  "rewardEntryCount" INTEGER NOT NULL,
  "rewardExpenseMinor" BIGINT NOT NULL,
  "distinctBeneficiaryUsers" INTEGER NOT NULL,
  "postedScheduledCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reward_performance_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reward_performance_daily_tenantId_day_currency_key"
  ON "reward_performance_daily"("tenantId", "day", "currency");
CREATE INDEX "reward_performance_daily_tenantId_day_idx"
  ON "reward_performance_daily"("tenantId", "day");

CREATE TABLE "tenant_liability_daily" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL,
  "rawLiabilityMinor" BIGINT NOT NULL,
  "displayLiabilityMinor" BIGINT NOT NULL,
  "accountCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_liability_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_liability_daily_tenantId_day_currency_key"
  ON "tenant_liability_daily"("tenantId", "day", "currency");
CREATE INDEX "tenant_liability_daily_tenantId_day_idx"
  ON "tenant_liability_daily"("tenantId", "day");

CREATE TABLE "cohort_retention_daily" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "cohortDay" TIMESTAMP(3) NOT NULL,
  "activityDay" TIMESTAMP(3) NOT NULL,
  "cohortSize" INTEGER NOT NULL,
  "retainedUsers" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cohort_retention_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cohort_retention_daily_tenantId_cohortDay_activityDay_key"
  ON "cohort_retention_daily"("tenantId", "cohortDay", "activityDay");
CREATE INDEX "cohort_retention_daily_tenantId_cohortDay_idx"
  ON "cohort_retention_daily"("tenantId", "cohortDay");
CREATE INDEX "cohort_retention_daily_tenantId_activityDay_idx"
  ON "cohort_retention_daily"("tenantId", "activityDay");
