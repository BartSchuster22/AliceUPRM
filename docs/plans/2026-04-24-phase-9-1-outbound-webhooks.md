# Phase 9.1 Outbound Webhooks Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: Deliver domain events from UPRM back to tenant platforms with signed outbound webhooks, retry scheduling, dead-letter handling, replay support, and admin visibility.

Architecture: Reuse the existing RabbitMQ + worker architecture. Domain code emits outbound webhook-worthy events into a durable delivery table, and the worker owns delivery attempts, exponential backoff, dead-letter transitions, and replay execution. Admin API exposes delivery logs and replay actions; admin-web adds an operational deliveries view.

Tech Stack: TypeScript, NestJS, Prisma/Postgres, RabbitMQ, existing UPRM worker/admin-web stack.

---

## Current verified baseline

- Existing exchange: `uprm.events`
- Existing outbox relay publishes `uprm.events.<eventType>` for ingested tenant events
- Existing worker already runs long-lived loops for outbox relay and reward scheduling
- Existing tenant config includes `webhookConfig`, but currently only supports inbound Stripe config
- Existing admin backoffice already supports tenant config editing and placeholder operational views
- Missing today:
  - outbound webhook delivery persistence
  - outbound webhook dispatcher loop
  - admin delivery log/replay endpoints
  - outbound webhook UI
  - outbound domain events such as `RewardApproved` / `WalletBalanceChanged`

---

## Scope for Phase 9.1

In-scope:

1. Prisma model(s) for outbound webhook deliveries
2. Extended tenant webhook config schema for outbound delivery settings
3. Domain event emission for the first supported event set:
   - `reward.created`
   - `reward.approved`
   - `refund.reversed`
   - `wallet.balance.changed`
4. Worker dispatcher with signed HTTP POST, retry scheduling, dead-lettering, and replay
5. Admin API endpoints to list deliveries and replay one delivery
6. Admin UI page to inspect deliveries and trigger replay
7. Tests for signing, retry behavior, replay, and admin endpoints

Out-of-scope for this phase:

- generic subscriber management UI beyond tenant config editing
- fraud/promoter domain event generation not yet backed by real domain models
- webhook batching
- per-endpoint secret rotation history

---

## Proposed data model

Add Prisma model:

```prisma
model WebhookDelivery {
  id               String   @id @default(uuid())
  tenantId         String
  eventType        String
  endpointUrl      String
  signingSecret    String
  payload          Json
  status           String   @default("pending") // pending | delivering | delivered | retrying | dead_letter
  attemptCount     Int      @default(0)
  nextAttemptAt    DateTime @default(now())
  lastAttemptAt    DateTime?
  deliveredAt      DateTime?
  lastStatusCode   Int?
  lastError        String?
  sourceTopic      String?
  sourceEventId    String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([tenantId, createdAt])
  @@index([status, nextAttemptAt])
  @@index([tenantId, eventType, createdAt])
  @@map("webhook_deliveries")
}
```

Config target shape inside `tenant_configs.webhookConfig`:

```json
{
  "stripe": {
    "enabled": true,
    "webhookSecret": "whsec_...",
    "mode": "live",
    "defaultCurrency": "EUR"
  },
  "outbound": {
    "enabled": true,
    "endpoints": [
      {
        "id": "psi-primary",
        "url": "https://psi.example.com/api/uprm/webhooks",
        "secret": "supersecret",
        "eventTypes": [
          "reward.created",
          "reward.approved",
          "refund.reversed",
          "wallet.balance.changed"
        ]
      }
    ]
  }
}
```

---

## File plan

### New files

- `packages/db/prisma/migrations/<timestamp>_webhook_deliveries/migration.sql`
- `packages/domain/webhooks/package.json`
- `packages/domain/webhooks/src/index.ts`
- `packages/domain/webhooks/src/types.ts`
- `packages/domain/webhooks/src/signing.ts`
- `packages/domain/webhooks/src/delivery.service.ts`
- `packages/domain/webhooks/src/delivery.service.test.ts`
- `packages/domain/webhooks/src/http-dispatcher.ts`
- `packages/domain/webhooks/src/http-dispatcher.test.ts`
- `apps/worker/src/webhooks/webhook-dispatcher.ts`
- `apps/worker/src/webhooks/webhook-dispatcher.spec.ts`
- `apps/admin-api/src/webhooks/webhook-deliveries.controller.ts`
- `apps/admin-api/src/webhooks/dto/list-webhook-deliveries-query.dto.ts`
- `apps/admin-web/src/components/WebhookDeliveriesView.tsx` (optional extraction if App.tsx gets too large)

### Modified files

- `packages/db/prisma/schema.prisma`
- `package.json` (workspace scripts if needed)
- `apps/worker/package.json`
- `apps/worker/src/main.ts`
- `apps/admin-api/src/app.module.ts`
- `apps/admin-api/src/tenants/dto/update-tenant-webhook-config.dto.ts`
- `apps/admin-api/src/tenants/tenants.controller.ts`
- `apps/admin-web/src/api.ts`
- `apps/admin-web/src/App.tsx`
- `apps/admin-web/src/styles.css`
- reward/ledger transition files where outbound events should be enqueued:
  - `packages/domain/rewards/src/scheduled-posting.service.ts`
  - possibly `packages/domain/ledger/src/posting.service.ts`
  - any refund compensation path that creates reversals

---

## Task breakdown

### Task 1: Add webhook delivery persistence

Objective: Create the DB schema needed to persist and track outbound delivery attempts.

Steps:

1. Add `WebhookDelivery` model to `packages/db/prisma/schema.prisma`.
2. Create raw SQL migration under `packages/db/prisma/migrations/`.
3. Regenerate Prisma client and verify build compatibility.
4. Add indexes for operational queries.

Verification:

- `pnpm --filter @uprm/db build` or equivalent workspace build passes.
- Prisma migration is syntactically valid.

Commit message:

- `feat: add outbound webhook delivery persistence`

### Task 2: Create domain/webhooks package

Objective: Add a dedicated domain package for webhook signing, scheduling, and dispatch orchestration.

Steps:

1. Create `packages/domain/webhooks` package.
2. Add types for outbound event payloads and delivery records.
3. Add signing helper implementing:
   - header format: `UPRM-Signature: t=<ts>,v1=<hex>`
   - signature body: HMAC-SHA256 over `<ts>.<raw-json-body>`
4. Add tests for deterministic signing.

Verification:

- package tests pass.
- package builds and can be imported from worker/admin-api.

Commit message:

- `feat: add webhook domain package`

### Task 3: Extend tenant webhook config for outbound endpoints

Objective: Support outbound endpoint configuration per tenant while preserving existing Stripe inbound config.

Steps:

1. Extend `UpdateTenantWebhookConfigDto` to validate outbound endpoints.
2. Update `TenantsController.updateWebhookConfig()` to merge, not clobber, config sections.
3. Ensure audit logging still records before/after.
4. Add/extend controller tests.

Verification:

- invalid endpoint URLs or empty event type arrays are rejected.
- updating outbound config preserves existing stripe config.

Commit message:

- `feat: support outbound tenant webhook config`

### Task 4: Emit first-class outbound events from reward flows

Objective: Produce durable outbound delivery records when reward-related domain transitions happen.

Steps:

1. Add a service that reads tenant outbound subscriptions and enqueues `webhook_deliveries` rows.
2. Hook reward scheduling/posting transitions to emit:
   - `reward.created` when a scheduled reward row is created
   - `reward.approved` when scheduled reward is posted into ledger
   - `refund.reversed` when compensation posts a reversal
   - `wallet.balance.changed` whenever a posted reward or reversal changes a user-facing balance
3. Keep event payloads stable, explicit, and tenant-scoped.
4. Make enqueue idempotent where the same domain transition can be retried.

Verification:

- one reward-triggering event creates expected pending deliveries for subscribed endpoints only.
- non-subscribed event types create no deliveries.

Commit message:

- `feat: enqueue outbound webhook deliveries from reward lifecycle`

### Task 5: Build worker dispatcher with retries and dead-letter handling

Objective: Deliver pending webhooks over HTTP and manage retry lifecycle.

Steps:

1. Add `apps/worker/src/webhooks/webhook-dispatcher.ts`.
2. Dispatcher loop selects due rows with `status in (pending, retrying)` and `nextAttemptAt <= now` using claim-safe updates.
3. POST JSON payload to endpoint with:
   - `Content-Type: application/json`
   - `UPRM-Signature`
   - timestamp-based signing
4. On 2xx: mark delivered.
5. On non-2xx / network failure: increment attempt count, compute exponential backoff, set retrying.
6. After cutoff (>= 24h window or >= 6 attempts minimum), set `dead_letter`.
7. Expose metrics counters in worker `/metrics`.

Verification:

- failing endpoint retries multiple times with increasing delays.
- success marks delivered exactly once.
- duplicate dispatcher loops do not double-send the same claimed row.

Commit message:

- `feat: add outbound webhook dispatcher with retries`

### Task 6: Add admin API delivery log and replay endpoints

Objective: Allow admins to inspect deliveries and replay a failed/dead-letter delivery.

Steps:

1. Add controller endpoints:
   - `GET /admin/webhook-deliveries?tenantId=&status=&eventType=`
   - `POST /admin/webhook-deliveries/:id/replay`
2. Replay should clone or reset a delivery safely without mutating historical attempt facts incorrectly.
3. Add RBAC for `super_admin`, `tenant_admin`, `support`.
4. Audit log replay actions.
5. Add controller tests.

Verification:

- list endpoint filters properly.
- replay creates a new pending attempt path and is auditable.

Commit message:

- `feat: add admin webhook delivery operations`

### Task 7: Add admin-web deliveries screen

Objective: Give operators a usable screen to inspect delivery health and replay failures.

Steps:

1. Add API helpers in `apps/admin-web/src/api.ts`.
2. Add a new nav item/view for Webhooks.
3. Render table with columns:
   - created at
   - tenant
   - event type
   - endpoint URL
   - status
   - attempts
   - last status code
   - last error
4. Add filters for tenant/status/event type.
5. Add replay button for `dead_letter` and failed deliveries.

Verification:

- page loads against live admin API contract.
- replay action updates UI state after success.

Commit message:

- `feat: add admin webhook deliveries screen`

### Task 8: End-to-end verification and deployment

Objective: Prove the feature works locally/integration and then deploy safely.

Steps:

1. Run targeted unit/integration tests.
2. Build affected packages/apps.
3. Apply migration.
4. Restart worker/admin-api.
5. Create a temporary subscribed endpoint for smoke verification.
6. Confirm:
   - delivery rows created
   - signature header present
   - retry lifecycle works
   - replay works
   - admin page shows attempts

Verification commands:

- `pnpm --filter worker test`
- `pnpm --filter admin-api test`
- `pnpm --filter admin-web build`
- `pnpm --filter worker build`
- `pnpm --filter admin-api build`

Commit message:

- `feat: complete phase 9 outbound webhooks`

---

## Implementation notes and decisions

1. Keep delivery rows as the durable execution source of truth

- Do not rely on RabbitMQ alone for retry timing or historical audit.
- RabbitMQ remains useful for existing event movement, but delivery scheduling should be DB-driven.

2. Prefer replay as “new attempt path” rather than mutating a delivered/dead-letter row in-place

- Preserve history.
- Easier auditing.

3. Store signing secret in webhook delivery row initially

- This makes replay deterministic even if tenant config changes later.
- Later hardening can encrypt this field if needed.

4. Preserve inbound Stripe config compatibility

- Do not break the already-live Stripe webhook adapter.

5. Use worker metrics for observability

- Add counters such as:
  - `uprm_webhooks_delivered_total`
  - `uprm_webhooks_failed_total`
  - `uprm_webhooks_dead_letter_total`
  - `uprm_webhooks_replayed_total`

---

## Risks

1. Duplicate sends under concurrency

- Mitigation: claim rows with conditional status transition before HTTP call.

2. Oversized payload drift

- Mitigation: keep payloads explicit and event-specific.

3. Secret exposure in admin payloads/logs

- Mitigation: do not return signing secrets from admin list endpoints.

4. Config overwrite bug

- Mitigation: merge webhook config sections, do not replace unrelated keys.

---

## Definition of done

Phase 9.1 is done when:

- webhook delivery rows persist in Postgres
- worker dispatches signed outbound webhooks
- retries/backoff/dead-letter work
- admins can list and replay deliveries
- admin-web shows delivery status operationally
- tests/builds pass
- live smoke verification confirms at least one successful signed delivery and one retry path
