-- CreateTable
CREATE TABLE "ingested_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalUserId" TEXT,
    "tenantUserId" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'queued',
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "ingested_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "linkedEventId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingested_events_tenantId_eventType_occurredAt_idx" ON "ingested_events"("tenantId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "ingested_events_processingStatus_receivedAt_idx" ON "ingested_events"("processingStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ingested_events_tenantId_idempotencyKey_key" ON "ingested_events"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "outbox_messages_status_createdAt_idx" ON "outbox_messages"("status", "createdAt");

-- CreateIndex
CREATE INDEX "event_links_tenantId_eventId_idx" ON "event_links"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "event_links_tenantId_linkedEventId_idx" ON "event_links"("tenantId", "linkedEventId");
