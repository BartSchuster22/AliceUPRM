# Phase 5 — Wallet-Backed Payout Reservations

> For Hermes: use the UPRM checkpoint flow. Keep TDD strict. Do not deploy before local verification is green.

Goal: move payout requests from tenant-scoped `user_balance` reservations to global wallet reservations while preserving the existing payout API/admin flows and payout lifecycle states.

Architecture: keep the existing `PayoutRequest` record and admin/API controllers, but change `PayoutService` so the source of funds is the global `WalletAccount` plus `WalletPayoutReservation`/`WalletPayoutAllocation` rows instead of tenant-scoped ledger `user_balance`. Preserve legacy payout ledger postings only where they still represent external cash execution, not the user’s source-of-funds reservation.

Tech stack: `packages/domain/payouts`, `packages/domain/wallet`, Prisma schema already applied, `apps/api-core`, `apps/admin-api`, Vitest/Jest, live systemd restarts for api/admin if deployed.

---

## Current-state sighting

1. `packages/domain/payouts/src/payout.service.ts`

- `requestPayout(...)` still checks `BalanceService.getUserBalance(...)` on tenant-scoped ledger balance.
- it creates a `PayoutRequest`, then posts ledger entries moving value from `user_balance` to `payout_payable`.
- it does not populate new additive fields already present in Prisma:
  - `userId`
  - `walletAccountId`
  - `amountCredits`
  - `issuerBreakdownJson`

2. `packages/domain/wallet/src/wallet-payout.service.ts`

- groundwork already exists:
  - `reservePayout(...)`
  - `markSent(...)`
  - `releaseReservation(...)`
- it creates `wallet_payout_reservations` and `wallet_payout_allocations`
- it decrements and restores `wallet_grant.amountRemaining`
- but it is not wired into `PayoutService` yet

3. `apps/api-core/src/users/users.controller.ts`

- payout request API shape is already stable and should stay stable
- current call still passes tenant-scoped request only; service should resolve global user/wallet internally

4. `apps/admin-api/src/payouts/payouts.controller.ts`

- admin approve/send/fail/cancel flow can remain the same at controller level
- domain service must change underneath it

5. Live DB state

- additive wallet/payout schema migration is already deployed live
- Phase 5 can use the wallet payout tables without introducing a new migration unless implementation proves one is still needed

---

## Phase 5 scope decision

This phase will do exactly this:

1. On payout request:

- resolve `TenantUser -> User`
- ensure/read global `WalletAccount`
- verify available wallet Credits, not tenant ledger balance
- reserve funds through `WalletPayoutService.reservePayout(...)`
- persist payout request with wallet fields populated
- persist issuer breakdown from reservation allocations
- stop reserving user funds through tenant-scoped ledger `user_balance`

2. On payout send:

- mark the wallet payout reservation as `sent`
- keep/adjust external-cash ledger posting as needed for tenant cash/payable accounting

3. On payout fail/cancel:

- release the wallet reservation back to grants
- avoid restoring via tenant-scoped `user_balance`

4. On payout reads:

- keep API/controller response shape stable
- include new DB fields only if already safe and useful internally, but do not break current clients

Non-goals for this phase:

- cross-tenant clearing entries
- settlement V2 bucket computation
- checkout credit spend
- retiring old payout-related ledger accounts entirely

---

## Implementation slices

### Slice 1 — failing tests first

Files:

- Modify: `packages/domain/payouts/src/payout.service.test.ts`
- Possibly modify: `apps/api-core/src/users/users.controller.spec.ts`
- Possibly modify: `apps/admin-api/src/payouts/payouts.controller.spec.ts`

Add RED tests for:

1. `requestPayout(...)` uses wallet reservation path and populates wallet fields
2. `requestPayout(...)` rejects insufficient wallet Credits even if legacy ledger path is irrelevant
3. `failPayout(...)` releases wallet reservation
4. `cancelPayout(...)` releases wallet reservation
5. `markSent(...)` marks wallet reservation sent

### Slice 2 — wire wallet services into payouts domain

Files:

- Modify: `packages/domain/payouts/src/payout.service.ts`
- Modify: `packages/domain/payouts/package.json`

Add dependencies/services:

- `WalletAccountService`
- `WalletBalanceService`
- `WalletPayoutService`

Core service changes:

1. resolve tenant user and `userId`
2. ensure wallet account
3. validate wallet balance against requested amount
4. create `PayoutRequest` with:

- `userId`
- `walletAccountId`
- `amountCredits`
- `issuerBreakdownJson`

5. reserve through `walletPayouts.reservePayout(...)`

### Slice 3 — payout lifecycle alignment

Files:

- Modify: `packages/domain/payouts/src/payout.service.ts`

Rules:

1. `approvePayout(...)`

- status change only

2. `markSent(...)`

- call `walletPayouts.markSent(...)`
- keep external-cash ledger posting if still needed for payout execution accounting

3. `failPayout(...)`

- call `walletPayouts.releaseReservation(...)`
- do not restore tenant `user_balance`

4. `cancelPayout(...)`

- call `walletPayouts.releaseReservation(...)`
- do not restore tenant `user_balance`

### Slice 4 — stabilize callers and verification

Files:

- Modify only if needed:
  - `apps/api-core/src/users/users.controller.ts`
  - `apps/admin-api/src/payouts/payouts.controller.ts`

Goal:

- keep controller contracts unchanged
- ensure all new tests/builds pass after package wiring

---

## Verification bundle

RED/GREEN sequence:

1. run targeted payout tests and confirm RED first
2. implement minimal domain changes
3. rerun targeted payout tests to GREEN
4. rerun relevant controller tests
5. run builds

Commands:

- `pnpm --filter @uprm/payouts test -- payout.service.test.ts`
- `pnpm --filter @uprm/payouts build`
- `pnpm --filter api-core test -- --runInBand users.controller.spec.ts`
- `pnpm --filter admin-api test -- --runInBand payouts.controller.spec.ts`
- `pnpm --filter api-core build`
- `pnpm --filter admin-api build`

If workspace links change:

- `pnpm install --no-frozen-lockfile`
- `pnpm --filter @uprm/db exec prisma generate`

---

## Expected live proof for Checkpoint C

1. services restart cleanly
2. authenticated payout request still works through API
3. resulting `payout_requests` row includes wallet fields
4. corresponding `wallet_payout_reservations` row exists
5. corresponding `wallet_payout_allocations` rows exist
6. failing or cancelling a payout restores grant residuals

---

## Known pitfalls to avoid

1. Do not keep using tenant `user_balance` as source-of-funds in parallel for the same payout reservation.
2. Do not forget to populate `PayoutRequest.userId` and `walletAccountId`; Phase 1 schema added them for a reason.
3. Do not lose issuer provenance; payout reservation allocations must preserve which grant lots funded the payout.
4. Do not break current payout controller/API response shape.
5. Do not treat `approve` as money movement; reservation should already exist from request time.
6. Do not forget `@uprm/payouts` now needs `@uprm/wallet` as a workspace dependency.
