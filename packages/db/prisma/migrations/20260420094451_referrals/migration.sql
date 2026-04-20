-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_edges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "referrerTenantUserId" TEXT NOT NULL,
    "referredTenantUserId" TEXT NOT NULL,
    "sourceCodeId" TEXT,
    "attributionMethod" TEXT NOT NULL DEFAULT 'code',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "referral_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_ancestry" (
    "tenantId" TEXT NOT NULL,
    "ancestorTenantUserId" TEXT NOT NULL,
    "descendantTenantUserId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_ancestry_pkey" PRIMARY KEY ("tenantId","descendantTenantUserId","ancestorTenantUserId")
);

-- CreateIndex
CREATE INDEX "referral_codes_tenantUserId_idx" ON "referral_codes"("tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_tenantId_code_key" ON "referral_codes"("tenantId", "code");

-- CreateIndex
CREATE INDEX "referral_edges_tenantId_referrerTenantUserId_idx" ON "referral_edges"("tenantId", "referrerTenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_edges_tenantId_referredTenantUserId_key" ON "referral_edges"("tenantId", "referredTenantUserId");

-- CreateIndex
CREATE INDEX "referral_ancestry_tenantId_ancestorTenantUserId_idx" ON "referral_ancestry"("tenantId", "ancestorTenantUserId");
