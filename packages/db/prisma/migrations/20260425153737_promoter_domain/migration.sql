-- CreateTable
CREATE TABLE "promoter_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "promoterStatus" TEXT NOT NULL DEFAULT 'user',
    "qualificationSource" TEXT NOT NULL DEFAULT 'manual',
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promoter_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promoter_applications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promoter_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promoter_application_links" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "proofJson" JSONB,

    CONSTRAINT "promoter_application_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promoter_profiles_tenantId_tenantUserId_effectiveFrom_idx" ON "promoter_profiles"("tenantId", "tenantUserId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "promoter_profiles_tenantId_tenantUserId_effectiveTo_idx" ON "promoter_profiles"("tenantId", "tenantUserId", "effectiveTo");

-- CreateIndex
CREATE INDEX "promoter_applications_tenantId_tenantUserId_submittedAt_idx" ON "promoter_applications"("tenantId", "tenantUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "promoter_applications_tenantId_status_submittedAt_idx" ON "promoter_applications"("tenantId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "promoter_application_links_applicationId_idx" ON "promoter_application_links"("applicationId");

-- AddForeignKey
ALTER TABLE "promoter_application_links" ADD CONSTRAINT "promoter_application_links_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "promoter_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
