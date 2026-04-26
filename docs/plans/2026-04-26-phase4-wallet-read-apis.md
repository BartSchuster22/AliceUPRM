# Phase 4 — Wallet Read APIs Behind Feature Flag

> For Hermes: follow UPRM checkpoint flow. Do not deploy until local verification is green.

Goal: expose global Credit wallet reads behind a feature flag while preserving the existing tenant-scoped balance path and surfacing migration diagnostics in admin reads.

Architecture: keep the current tenant-scoped ledger balance endpoint as the default path, add a wallet read service that computes spendable Credits from wallet grant residuals, and switch only the read response when a feature flag is enabled. Admin detail should expose both the legacy tenant-scoped balance and wallet diagnostics/parity so migration drift is visible before any cutover.

Tech stack: `apps/api-core`, `apps/admin-api`, `packages/domain/wallet`, Jest/Vitest, Prisma client via existing shared singleton.

---

## Current-state sighting

1. `apps/api-core/src/users/users.controller.ts`
   - `/v1/users/:id/balance` currently always reads `BalanceService.getUserBalance(...)`.
   - response is already Credits-first, but truth still comes from tenant-scoped ledger.

2. `apps/admin-api/src/users/admin-users.service.ts`
   - `getUserDetail(...)` returns legacy `balance` plus payouts/memberships/etc.
   - no wallet diagnostics or parity payload exists yet.

3. `packages/domain/wallet`
   - can ensure wallet accounts and create/list grant rows.
   - does not yet expose a dedicated read/balance service.

---

## Checkpoint A scope decisions

Phase 4 implementation will do exactly this:

1. Add `WalletBalanceService` in `packages/domain/wallet`.
2. Add a small feature-flag helper for wallet-v2 reads using `UPRM_WALLET_V2_READS`.
3. Update `/v1/users/:id/balance`:
   - legacy ledger path when flag is off
   - global wallet path when flag is on
4. Update admin user detail diagnostics to include:
   - legacy tenant balance
   - global wallet balance
   - issuer-scoped parity for the current tenant
   - wallet account metadata
5. Add tests first for:
   - wallet read path disabled
   - wallet read path enabled
   - admin diagnostics mapping

Non-goals for this phase:

- payout cutover
- checkout credit spend
- settlement v2
- live DB migration application beyond existing additive schema

---

## Implementation slices

### Slice 1 — wallet read domain service

- Create `packages/domain/wallet/src/wallet-balance.service.ts`
- Methods:
  - `getWalletBalance(walletAccountId)`
  - `getUserWalletBalance(userId)`
  - `getIssuerBalanceForWallet(walletAccountId, issuerTenantId)`
- Source of truth: sum `wallet_grant.amountRemaining`

### Slice 2 — api-core feature-flagged balance reads

- Modify `apps/api-core/src/users/users.controller.ts`
- Add helper:
  - `isWalletV2ReadEnabled()` from `process.env.UPRM_WALLET_V2_READS`
- When enabled:
  - resolve tenant user
  - resolve/create wallet account by `tenantUser.userId`
  - read global wallet balance
  - return same public shape plus metadata fields indicating wallet-v2 source
- When disabled:
  - preserve existing response shape and values

### Slice 3 — admin diagnostics/parity

- Modify `apps/admin-api/src/users/admin-users.service.ts`
- Extend detail payload with:
  - `walletAccount`
  - `walletBalance`
  - `walletIssuerBalance`
  - `walletParity` comparing current tenant legacy display balance vs issuer-scoped wallet residual
- Modify `apps/admin-api/src/users/users.controller.ts` mapping accordingly

### Slice 4 — tests and verification

- Add/extend tests:
  - `packages/domain/wallet/src/wallet-balance.service.test.ts`
  - `apps/api-core/src/users/users.controller.spec.ts`
  - `apps/admin-api/src/users/admin-users.service.spec.ts`
  - `apps/admin-api/src/users/users.controller.spec.ts`
- Verification bundle:
  - `pnpm --filter @uprm/wallet test`
  - `pnpm --filter @uprm/wallet build`
  - `pnpm --filter api-core test -- users.controller.spec.ts`
  - `pnpm --filter api-core build`
  - `pnpm --filter admin-api test -- users.controller.spec.ts admin-users.service.spec.ts`
  - `pnpm --filter admin-api build`
