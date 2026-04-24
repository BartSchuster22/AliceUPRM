-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorAdminUserId" TEXT,
    "actorSubject" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tenantId" TEXT,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_subject_key" ON "admin_users"("subject");

-- CreateIndex
CREATE INDEX "audit_logs_actorAdminUserId_createdAt_idx" ON "audit_logs"("actorAdminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_createdAt_idx" ON "audit_logs"("resourceType", "resourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_actorAdminUserId_fkey"
FOREIGN KEY ("actorAdminUserId") REFERENCES "admin_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
