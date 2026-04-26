# Phase 6 — Direct Credit Spend in Checkout Flow

> Checkpoint A plan. Goal: add real wallet-backed Credit spend to checkout creation before Stripe session issuance, then finalize or release that reservation based on Stripe lifecycle outcomes.

## Current-state verdicts

1. Checkout endpoint exists: YES
- File: `apps/api-core/src/billing/billing.controller.ts`
- It already resolves tenant + product pricing and creates Stripe checkout sessions.
- It currently has no wallet or credit-spend logic.

2. Checkout DTO supports credit-spend intent: NO
- File: `apps/api-core/src/billing/dto/create-checkout-session.dto.ts`
- Current DTO has no `applyCredits` or `creditsToUse` fields.

3. Billing controller can resolve the purchasing tenant user: NOT YET
- The identity domain already exposes the exact lookup we need:
  - `packages/domain/identity/src/identity.service.ts`
  - `getTenantUserByExternalUserId(tenantId, externalUserId)`
- Billing does not currently use it.

4. Wallet account creation support exists: YES
- File: `packages/domain/wallet/src/wallet-account.service.ts`
- `ensureAccount({ userId, currency })` already exists and defaults to `credit`.

5. Wallet redemption reservation lifecycle exists: YES
- File: `packages/domain/wallet/src/wallet-redemption.service.ts`
- Already supports:
  - `reserveRedemption(...)`
  - `markPosted(...)`
  - `releaseRedemption(...)`
- This is the correct foundation for Phase 6.

6. Stripe checkout metadata carries wallet reservation context: NO
- File: `packages/domain/payments/src/stripe.service.ts`
- Current metadata only carries:
  - `externalUserId`
  - `plan`
  - optional `referralCodeUsed`

7. Stripe webhook normalization can preserve metadata for follow-up actions: PARTIALLY
- File: `packages/domain/payments/src/stripe.service.ts`
- `checkout.session.completed` currently maps to `subscription_started`.
- Event schemas already allow `metadata` on `subscription_started` and `invoice_paid`.
- Current normalization does not forward wallet-redemption metadata yet.

8. There is a clean ingestion path for Stripe-derived metadata: YES
- File: `packages/domain/events/src/ingestion.service.ts`
- Ingested event payload is persisted as-is, including `metadata`, and placed on the outbox.

9. There is already a clean direct webhook entrypoint: YES
- File: `apps/admin-api/src/webhooks/stripe-webhooks.controller.ts`
- Current behavior is normalize Stripe event -> ingest event.
- No wallet finalization hook exists yet.

10. There is a real internal order / purchase aggregate already available for spend posting: NO
- In the currently sighted UPRM code, Stripe subscription checkout remains the durable anchor.
- So Phase 6 should attach to checkout/session lifecycle first, not invent a broad order subsystem.

## Phase 6 implementation decision

Implement the smallest real production slice in this order:

### Slice 1 — Checkout request can ask to apply Credits
Add to `CreateCheckoutSessionDto`:
- `applyCredits?: boolean`
- `creditsToUse?: number`

Rules:
- omitted or false => preserve current behavior
- positive credit-spend request => attempt wallet reservation
- requested Credits must clamp to available wallet balance and to product amount
- checkout amount sent to Stripe must remain valid and non-negative

### Slice 2 — Add billing-side orchestration for credit spend
Create a minimal helper/service under `apps/api-core/src/billing/`.

Recommended file:
- `billing-credit.service.ts`

Responsibilities:
1. resolve tenant user from `externalUserId`
2. resolve global user from tenant user include
3. ensure credit wallet account
4. reserve wallet redemption when credit spend requested
5. compute adjusted Stripe amount
6. return wallet reservation context back to the controller

Expected returned context:
- `adjustedAmountMinor`
- `appliedCredits`
- `walletRedemptionId`
- `tenantUserId`
- `userId`

### Slice 3 — Extend Stripe checkout input + metadata
Modify:
- `packages/domain/payments/src/stripe.service.ts`
- `packages/domain/payments/src/stripe.checkout.test.ts`

Extend `CreateCheckoutSessionInput` with optional fields:
- `appliedCredits?: number`
- `walletRedemptionId?: string`
- `tenantUserId?: string`
- `userId?: string`

Then persist them into Stripe session metadata.

Required metadata additions:
- `walletRedemptionId`
- `appliedCredits`
- `tenantUserId`
- `userId`

### Slice 4 — Forward wallet metadata through Stripe webhook normalization
Modify `StripeWebhookService.normalizeCheckoutCompleted(...)` so the resulting `subscription_started` payload includes `metadata` when the session has wallet-credit fields.

Minimum metadata to forward:
- `walletRedemptionId`
- `appliedCredits`
- `tenantUserId`
- `userId`

Reason:
- Event schemas already allow metadata.
- Ingestion already persists metadata.
- This gives a durable audit trail and a clean bridge for finalization.

### Slice 5 — Finalize reserved redemption on successful checkout completion
Implement a small post-ingestion or webhook-side hook to mark the wallet redemption posted when a checkout-backed subscription actually completes.

Smallest honest location to do this first:
- directly in the Stripe webhook handling path after successful normalize/ingest, or
- via a focused helper invoked from the webhook controller using the normalized payload metadata.

Do not invent a wide event-consumer redesign in this phase unless forced.

Success trigger:
- normalized event is `subscription_started`
- normalized metadata contains `walletRedemptionId`

Action:
- `WalletRedemptionService.markPosted(walletRedemptionId)`

### Slice 6 — Explicit release path for abandoned / failed checkout
Phase 6 should at least expose an explicit internal release path even if full automatic cancellation handling is deferred.

Reason:
- reserved Credits must not remain stranded forever on failed/abandoned checkout attempts.

Minimum acceptable first slice:
- create a release helper or endpoint/service path that can release by `walletRedemptionId`
- document that automatic public cancel release may remain a follow-up if no clean Stripe cancel signal exists in current flow

## TDD plan for Checkpoint B

### Billing controller tests — RED first
Update `apps/api-core/src/billing/billing.controller.spec.ts` with failing tests for:
1. `applyCredits=true` reserves Credits and sends reduced Stripe amount
2. credit-spend request with unresolved tenant user returns correct client error
3. insufficient available Credits returns correct client error, not 500
4. productRef flow still works with no credit spend requested

### Checkout metadata tests — RED first
Update `packages/domain/payments/src/stripe.checkout.test.ts` with failing tests that assert:
1. wallet redemption metadata is persisted into Stripe session metadata
2. applied credit amount is included
3. adjusted amount is what becomes the line-item `unit_amount`

### Webhook normalization tests — RED first
Update `packages/domain/payments/src/stripe.service.test.ts` with failing tests that assert:
1. `checkout.session.completed` forwards wallet-redemption metadata into normalized `subscription_started`
2. normalization still works when wallet metadata is absent

## Verification bundle for Checkpoint B

Use targeted verification only.

1. `admin-web` is unrelated to this phase and should remain untouched.
2. Run targeted backend tests/builds only.

Expected bundle:
- `pnpm --filter @uprm/payments test -- stripe.checkout.test.ts`
- `pnpm --filter @uprm/payments test -- stripe.service.test.ts`
- `pnpm --filter api-core test -- --runInBand billing.controller.spec.ts`
- `pnpm --filter @uprm/payments build`
- `pnpm --filter api-core build`

If new workspace edges are added:
- rerun workspace install / package build order as needed per repo ops skill

## Live-proof target for Checkpoint C

Minimum honest proof:
1. checkout request without credit-spend still works
2. checkout request with requested credit spend reserves wallet redemption and returns Stripe session
3. returned Stripe session metadata contains wallet-redemption context
4. successful Stripe completion path marks wallet redemption as `posted`
5. if automatic cancel-release is not yet wired, explicit release path is proven and documented

## Known caveats to preserve during implementation

1. Do not permanently debit Credits before checkout success.
- Reserve first, then post.

2. Do not invent a fake order subsystem.
- Current durable anchor is Stripe checkout/session lifecycle.

3. Do not turn expected wallet insufficiency into 500s.
- Map to client-safe business errors.

4. Do not lose issuer provenance.
- Wallet redemption allocations must remain attached to grants.

5. Preserve current non-credit checkout behavior unchanged.
- No regression for existing Stripe path.
