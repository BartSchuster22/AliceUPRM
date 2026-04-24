-- AlterTable
ALTER TABLE "admin_users"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
