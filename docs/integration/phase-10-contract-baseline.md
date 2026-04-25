# Phase 10 Contract Baseline

Status: canonical live-contract baseline for Phase 10 execution.
Source of truth order used for this file:

1. live `/srv/uprm` source files
2. live repo state and commits
3. live runtime/DB verification
4. roadmap intent in `UPRM_Implementation_Guide.md`

This file exists to prevent Phase 10 SDK and PSI cutover work from targeting stale assumptions.

---

## 1. Live UPRM tenant API surface relevant to PSI

All routes below are live in `/srv/uprm/apps/api-core/src/*` and are protected by `HmacAuthGuard`.

### Identity / user routes

File:

- `apps/api-core/src/users/users.controller.ts`

Verified live routes:

- `POST /v1/users`
  - current practical meaning: create or fetch/link a tenant user by `email`, `externalUserId`, and optional `username`
  - current response shape wraps a `tenant_user`
- `GET /v1/users/:id`
- `GET /v1/users/:id/balance`
  - current wallet read path for PSI integration
  - returns:
    - `tenant_user_id`
    - `base_currency`
    - `balance_credits`
    - `balance_display`
    - `balance_as_money.amount_minor`
    - `balance_as_money.formatted`
  - accounting convention: raw `user_balance` ledger sign is negated for user-facing balance
- `GET /v1/users/external/:externalUserId/profile`
  - current PSI-facing profile summary helper
- `GET /v1/users/external/:externalUserId/subscriptions`
  - current PSI-facing subscription summary helper
- `POST /v1/users/:id/payouts`
- `GET /v1/users/:id/payouts`
- `GET /v1/users/:id/referral-tree?depth=N`

### Referral routes

File:

- `apps/api-core/src/referrals/referrals.controller.ts`

Verified live routes:

- `POST /v1/referrals/codes`
- `GET /v1/referrals/codes/:code`
- `POST /v1/referrals/apply`
- `GET /v1/referrals/users/:externalUserId/summary`
  - current PSI-facing referral-summary helper
  - current response includes:
    - `tenant_user_id`
    - `external_user_id`
    - `referral_code`
    - `active_count`
    - `converted_count`
    - `total_credit_cents`
    - `referrals`
    - `ledger` (currently empty in UPRM response shape)

### Billing / checkout route

File:

- `apps/api-core/src/billing/billing.controller.ts`

Verified live route:

- `POST /v1/billing/checkout-sessions`

Verified live behavior:

- tenant resolved from HMAC auth context
- tenant must exist
- tenant Stripe config must be enabled or route returns conflict
- checkout can now be created in two modes:
  - compatibility mode: tenant sends raw pricing fields
  - preferred mode: tenant sends `productRef` and UPRM resolves pricing from the tenant product catalog
- requested/resolved currency must match tenant base currency or route returns bad request
- missing `STRIPE_SECRET_KEY` is normalized to a conflict response:
  - `stripe checkout provider is not configured`

Current practical meaning:

- PSI can delegate checkout-session ownership to UPRM today
- UPRM now supports the cleaner externalised direction where checkout is driven by tenant-registered product references instead of raw pricing payloads alone

### Product registration route

Files:

- `apps/api-core/src/products/products.controller.ts`
- `packages/domain/tenants/src/tenant.service.ts`

Verified live route:

- `POST /v1/products/register`

Current practical meaning:

- a tenant can register or update its own checkout products in UPRM
- UPRM stores the tenant product catalog in tenant config and can later resolve `productRef` during checkout creation

Current practical meaning:

- PSI can delegate checkout-session ownership to UPRM today

### Event ingestion route

File:

- `apps/api-core/src/events/events.controller.ts`
- event schema source: `packages/domain/events/src/schemas.ts`

Verified live route:

- `POST /v1/events`

Verified event types from current schema:

- `user_registered`
- `email_verified`
- `subscription_started`
- `subscription_paid`
- `invoice_paid`
- `purchase_completed`
- `refund_issued`
- `subscription_cancelled`
- `chargeback_opened`
- `chargeback_won`
- `chargeback_lost`

Shared event-envelope fields from current schema:

- `eventType`
- `idempotencyKey`
- `externalEventId`
- `externalUserId` for user-bound events
- optional `occurredAt`
- optional `linkedExternalEventId` for compensating events

Current practical meaning:

- `submitEvent()` in the future SDK must target this real event schema, not invent a separate one

---

## 2. Verified live contract behavior that matters for SDK design

### HMAC auth is the current contract

The Phase 10 client must target the current HMAC tenant API, not bootstrap/admin auth.

Current PSI seam evidence:

- PSI already contains a handwritten `UprmClient` under `apps/backend-api/src/integrations/uprm/client.ts`
- it signs requests using the current `UPRM-HMAC <keyPrefix>:<ts>:<sig>` header model

Implication:

- the future reusable `packages/clients/uprm-client` should absorb and standardize this behavior
- PSI should stop owning bespoke signing logic once the shared package exists

### `createUser` currently covers the practical `linkTenantUser` use case

Current live evidence:

- `POST /v1/users` is already used from PSI to create/sync a tenant user using PSI user id as `externalUserId`

Implication:

- do not assume a separate server route is needed for `linkTenantUser`
- first SDK version should likely model this as:
  - `createUser(...)`
  - optional alias/helper semantics if needed
- only add a distinct `linkTenantUser` route if the seam inventory proves a real ambiguity or missing behavior

### Wallet read exists today

Current live evidence:

- `GET /v1/users/:id/balance`
- current PSI/U PRM seam also uses a referral summary route carrying credits information

Implication:

- `getWallet()` should be backed by `/v1/users/:id/balance`
- do not invent a second wallet route for Phase 10 unless necessary

### Promoter status is not yet a safe first-class SDK method

Current live evidence:

- promoter applications remain placeholder-only in admin-api
- no promoter-status route has been verified in the public tenant API during this planning pass

Implication:

- `getPromoterStatus()` is deferred from the first SDK slice unless a real public contract is found and verified
- document the deferral instead of shipping a fake method

### Checkout is already a real seam candidate

Current live evidence:

- `/v1/billing/checkout-sessions` is mounted and already partly consumed from PSI seam code

Implication:

- the first SDK slice should likely include `createCheckoutSession()` even though it was not emphasized enough in the original P10.1 wording
- this is justified by live code reality, not by roadmap preference

---

## 3. Roadmap-to-live mapping for Phase 10 SDK methods

Original roadmap methods:

- `createUser`
- `linkTenantUser`
- `createReferralCode`
- `applyReferralCode`
- `submitEvent`
- `getWallet`
- `getPromoterStatus`

Reality-based Phase 10 mapping:

- `createUser` -> yes, backed by `POST /v1/users`
- `linkTenantUser` -> probably covered by `createUser` semantics today; keep as mapping question, not a promised separate route
- `createReferralCode` -> yes, backed by `POST /v1/referrals/codes`
- `applyReferralCode` -> yes, backed by `POST /v1/referrals/apply`
- `submitEvent` -> yes, backed by `POST /v1/events`
- `getWallet` -> yes, backed by `GET /v1/users/:id/balance`
- `getPromoterStatus` -> not yet proven; defer from first SDK release unless a real route is verified

Additional live methods the first SDK should likely support because PSI already needs them:

- `getUserProfileByExternalUserId`
- `getSubscriptionsByExternalUserId`
- `getReferralSummaryByExternalUserId`
- `createCheckoutSession`

---

## 4. Explicit contract questions that must stay visible

These are not blockers for documentation, but they are real execution questions:

1. Should the first shared SDK expose `linkTenantUser()` as a separate public method, or should it document that `createUser()` is the canonical current upsert/link operation?
2. Should the SDK expose both `getWallet(tenantUserId)` and `getReferralSummary(externalUserId)` in the first slice, given PSI currently uses both styles of read?
3. Is a real promoter-status public contract needed for current PSI cutover work, or can it remain deferred because promoter product surfaces are still incomplete?
4. Should the Phase 10 SDK include explicit typed wrappers for checkout ownership now, since PSI already calls a local seam helper for checkout?

Until proven otherwise, the safe answer is:

- build the SDK around routes that are already mounted and already needed by PSI
- defer unverified methods

---

## 5. Canonical Phase 10 consequence

From live repo reality, the first implementation slice after this document is:

1. create `packages/clients/uprm-client`
2. standardize HMAC signing + retry + response handling there
3. implement only the verified methods above
4. move PSI off its handwritten `apps/backend-api/src/integrations/uprm/client.ts`

This is the contract baseline the SDK task must follow.
