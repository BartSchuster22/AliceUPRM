# Webhooks + Fraud Dashboard List/Detail Implementation Plan

> For Hermes: use the UPRM checkpoint flow. Finish Checkpoint A with exact backend/frontend surface, then implement and verify locally before live deploy.

Goal: reshape the admin dashboard Webhooks and Fraud screens into click-to-open list/detail flows that match the requested operator workflow.

Architecture: extend admin-api so it returns the missing webhook detail and readable actor/tenant/user labels, then update admin-web to use list-first/detail-second panels with explicit close/back actions. Keep existing replay and fraud-resolution actions intact.

Tech Stack: NestJS admin-api, domain services under packages/domain, React admin-web, Vitest/Jest workspace tests.

---

## Scope

1. Webhooks

- Add filter bar:
  - tenant: all by default, specific tenant options
  - status: all by default, specific HTTP/result statuses
- Change screen from plain table with inline replay only to:
  - webhook delivery list
  - click row to open webhook detail
  - close/back button at top-right of detail
- Detail should show:
  - users involved
  - tenant involved
  - event
  - balance
- Preserve replay action if practical in detail view

2. Fraud

- Keep Fraud case queue but change UX to requested click-open detail with close/back button top-right
- Queue columns:
  - date
  - user name
  - status
  - severity
  - score
  - holds
- Detail panel remains real backend-backed, not mock

## Backend tasks

### Task A1: Add webhook delivery detail retrieval support

Files:

- Modify: apps/admin-api/src/webhooks/webhook-deliveries.controller.ts
- Modify: apps/admin-api/src/webhooks/webhook-deliveries.controller.spec.ts
- Modify: packages/domain/webhooks/src/delivery.service.ts

Steps:

1. Add `getDelivery(id)` to the domain service.
2. In admin-api, add `GET /admin/webhook-deliveries/:id`.
3. Map detail fields with normalized names.
4. Join enough tenant/user context to expose readable labels plus payload-derived balance/event data.
5. Add controller spec coverage for detail and not-found behavior.

### Task A2: Add readable fraud queue/detail labels

Files:

- Modify: apps/admin-api/src/fraud/fraud-cases.controller.ts
- Modify: apps/admin-api/src/fraud/fraud-cases.controller.spec.ts

Steps:

1. Enrich fraud list rows with a user label if tenant user exists.
2. Enrich fraud detail with readable tenant/user context where available.
3. Keep existing action endpoints unchanged.
4. Add/update tests proving normalized enriched fields.

## Frontend tasks

### Task B1: Extend admin-web API types/functions

Files:

- Modify: apps/admin-web/src/api.ts

Steps:

1. Add webhook detail type.
2. Add webhook list row fields for display labels if backend returns them.
3. Add `fetchWebhookDeliveryDetail()`.
4. Add fraud row/detail label fields.

### Task B2: Convert Webhooks screen into list/detail flow

Files:

- Modify: apps/admin-web/src/App.tsx
- Modify: apps/admin-web/src/styles.css

Steps:

1. Add selected webhook state.
2. Add tenant/status filters in toolbar.
3. Make list rows clickable.
4. Render webhook detail panel with top-right Close button.
5. Show user/tenant/event/balance fields from backend detail.
6. Keep replay action accessible.

### Task B3: Convert Fraud screen into list/detail flow

Files:

- Modify: apps/admin-web/src/App.tsx
- Modify: apps/admin-web/src/styles.css

Steps:

1. Reuse existing queue filters.
2. Make queue fully list-first with detail-open state.
3. Show readable user name in queue instead of raw tenant_user_id where available.
4. Add top-right Close button on detail.
5. Preserve allow/reject/escalate behavior.

## Local verification bundle

Run targeted verification:

- admin-api webhook controller tests
- admin-api fraud controller tests
- admin-api build
- admin-web tests
- admin-web build

## Live verification bundle

1. Open dashboard Webhooks screen.
2. Confirm tenant/status filters render.
3. Click a delivery row and confirm detail opens with close/back button.
4. Open Fraud screen.
5. Confirm queue shows readable user label.
6. Click a fraud row and confirm detail opens with close/back button.
7. Confirm back/close returns to list.

## Closeout

- update todo
- git status review
- commit
- push
