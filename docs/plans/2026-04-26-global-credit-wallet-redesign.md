# Global Credit Wallet Redesign Implementation Plan

> For Hermes: use the UPRM checkpoint flow. This is a design-and-execution plan for replacing tenant-scoped reward balances with a global UPRM Credit wallet while preserving issuing-tenant liability, payout correctness, and settlement truth.

Goal: move UPRM from tenant-scoped reward balances to a global user wallet denominated only in Credits, where users can earn on PSI and other tenants and spend system-wide, with issuer provenance, cross-tenant clearing, FX normalization at ingress, and settlement snapshots that reflect real outstanding obligations.

Architecture: introduce a new wallet domain centered on `User.id` rather than `TenantUser.id`, make `Credit` the only canonical internal monetary unit, normalize all external fiat into Credits at ingress, and track provenance in grant lots plus clearing entries so issuing tenants, spending tenants, and UPRM platform positions remain auditable. Roll out additively with dual-write and parity checks before cutting reads and settlement truth over.

Tech Stack: Prisma schema under `packages/db/prisma/schema.prisma`, domain packages in `packages/domain/*`, Nest apps in `apps/api-core` and `apps/admin-api`, React admin-web, workspace tests (Vitest/Jest).

---

## Product rules locked in

These rules are now canonical for the redesign:

1. Internal currency is `Credit` only.
2. Peg: `1 Credit = 1 euro cent`.
3. All internal balances, rewards, liabilities, redemptions, payouts, and settlement numbers must be stored and calculated in Credits.
4. EUR is a display/reference currency, not the canonical internal balance unit.
5. Any non-EUR inflow must cross an FX normalization boundary first:
   - external amount in source fiat
   - convert to EUR using the applicable FX rate
   - convert EUR cents 1:1 into Credits
   - persist Credits as the only canonical internal amount
6. User-facing balances should display Credits first, with small EUR equivalent:
   - `1000 Credits (10 €)`
7. Users can earn on PSI and other tenants, but spend system-wide from one UPRM wallet.
8. Economic liability must remain attributable to the issuing tenant or other funding source even though the user experiences one global wallet.

---

## Current-state truth to design against

This plan assumes the current live UPRM state:

1. Reward balances are tenant-scoped today.
   - `BalanceService.getUserBalance(tenantId, tenantUserId, currency)`
   - `AccountService.ensureUserBalanceAccount({ tenantId, tenantUserId, currency })`
   - therefore balances are tied to `TenantUser`, not global `User`.

2. Rewards are currently created through scheduled postings.
   - `scheduled_postings` hold future reward postings.
   - posted rewards hit tenant-scoped `ledger_accounts.accountType = 'user_balance'`.

3. Payouts are tenant-scoped today.
   - `payout_requests` use `tenantId`, `tenantUserId`, `amountMinor`, `baseCurrency`.
   - payout reservation moves value from `user_balance` to `payout_payable`.

4. Settlement cycles are tenant-scoped today.
   - `settlement_cycles` currently store only:
     - `ledgerLiabilityMinor`
     - `pendingLiabilityMinor`
     - `totalLiabilityMinor`
   - current settlement logic snapshots:
     - posted tenant-scoped `user_balance`
     - pending scheduled postings
   - it does not model a global wallet or full clearing positions.

5. Checkout does not spend credits today.
   - `apps/api-core/src/billing/billing.controller.ts` creates Stripe sessions only.
   - there is no global-wallet debit or credit redemption path.

These truths are the baseline; do not design as if a global wallet already exists.

---

## Target-state model

### Target money model

The platform must move from:

- tenant-local reward balances

to:

- one global UPRM Credit wallet per real user (`User.id`)
- issuer provenance per grant/lot
- system-wide spend
- tenant/platform clearing entries for every non-local funding/use path

### Target identity model

Current primary balance owner:

- `TenantUser.id`

Target primary balance owner:

- `User.id`

`TenantUser` remains important for:

- provenance
- local tenant membership
- referral chains
- purchase attribution
- issuer/spender mapping

But wallet truth moves to the global user identity.

### Target obligation model

Open obligations must be split into explicit buckets:

1. Funded unredeemed wallet liability

- Credits already granted to the global wallet and still spendable/unconsumed.

2. Pending reward liability

- Credits promised by reward logic but not yet posted into the wallet.

3. Payout-reserved liability

- Credits no longer spendable because they were reserved for payout, but still owed until the payout is actually sent.

4. Cross-tenant clearing payable/receivable

- the issuer tenant funded the credits
- the spending tenant accepted the credits
- UPRM must track who owes whom internally

Settlement V2 must report these buckets explicitly.

---

## Schema changes

This section names the actual current schema surfaces and the exact new schema needed.

### Existing schema to preserve during migration

Keep these current models initially:

- `User`
- `TenantUser`
- `ScheduledPosting`
- `PayoutRequest`
- `SettlementCycle`
- `LedgerAccount`
- `LedgerPosting`
- `TenantLiabilityDaily`

Do not remove or repurpose them in the first migration.

### New models to add

#### 1. Global wallet account

Add `WalletAccount`.

Purpose:

- canonical balance container for one global user wallet in Credits

Suggested fields:

- `id String @id @default(uuid())`
- `userId String`
- `currency String` // must be `credit` for now
- `status String @default("active")`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Suggested constraints:

- unique `[userId, currency]`
- index `[status, createdAt]`

Notes:

- there should be one active `credit` wallet per `User.id`
- do not allow tenant-scoped ownership here

#### 2. Wallet grant / lot provenance

Add `WalletGrant`.

Purpose:

- records where Credits came from and how much remains unconsumed

Suggested fields:

- `id String @id @default(uuid())`
- `walletAccountId String`
- `issuerTenantId String?`
- `sourceTenantUserId String?`
- `originType String` // reward | topup | manual_adjustment | reversal | migration_seed
- `sourceEventId String?`
- `sourceReferenceType String?`
- `sourceReferenceId String?`
- `amountIssued BigInt`
- `amountRemaining BigInt`
- `fxQuoteId String?`
- `expiresAt DateTime?`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Suggested constraints/indexes:

- index `[walletAccountId, createdAt]`
- index `[issuerTenantId, createdAt]`
- index `[originType, createdAt]`
- index `[sourceEventId]`

Notes:

- this is the provenance and consumption backbone
- grant consumption should use deterministic policy (recommend FIFO)

#### 3. Wallet redemption

Add `WalletRedemption`.

Purpose:

- records spending of Credits on products/services across the platform

Suggested fields:

- `id String @id @default(uuid())`
- `walletAccountId String`
- `spendingTenantId String`
- `spendingTenantUserId String?`
- `purchaseRef String?`
- `orderRef String?`
- `amountCredits BigInt`
- `status String @default("reserved")` // reserved | posted | reversed | released
- `createdAt DateTime @default(now())`
- `postedAt DateTime?`
- `reversedAt DateTime?`
- `updatedAt DateTime @updatedAt`

Suggested constraints/indexes:

- index `[walletAccountId, createdAt]`
- index `[spendingTenantId, createdAt]`
- index `[status, createdAt]`
- optional unique idempotency ref depending on purchase contract

#### 4. Wallet redemption grant allocation

Add `WalletRedemptionAllocation`.

Purpose:

- maps each redemption to the grants/lots actually consumed

Suggested fields:

- `id String @id @default(uuid())`
- `redemptionId String`
- `walletGrantId String`
- `issuerTenantId String?`
- `amountCredits BigInt`
- `createdAt DateTime @default(now())`

Suggested constraints:

- index `[redemptionId]`
- index `[walletGrantId]`
- index `[issuerTenantId, createdAt]`

Notes:

- this is what makes issuer-spender clearing auditable and reversible

#### 5. Wallet payout reservation

Add `WalletPayoutReservation`.

Purpose:

- tracks credits reserved for payout from the global wallet without losing issuer provenance

Suggested fields:

- `id String @id @default(uuid())`
- `walletAccountId String`
- `issuerTenantId String?`
- `payoutRequestId String`
- `amountCredits BigInt`
- `status String @default("reserved")` // reserved | sent | released
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

Suggested constraints:

- index `[walletAccountId, createdAt]`
- index `[payoutRequestId]`
- index `[issuerTenantId, createdAt]`

#### 6. Wallet payout allocation

Add `WalletPayoutAllocation`.

Purpose:

- maps payout reservations to the grants/lots they consume

Suggested fields:

- `id String @id @default(uuid())`
- `walletPayoutReservationId String`
- `walletGrantId String`
- `issuerTenantId String?`
- `amountCredits BigInt`
- `createdAt DateTime @default(now())`

Suggested constraints:

- index `[walletPayoutReservationId]`
- index `[walletGrantId]`
- index `[issuerTenantId, createdAt]`

#### 7. Tenant clearing entry

Add `TenantClearingEntry`.

Purpose:

- records economic settlement between issuing tenant, spending tenant, and/or platform

Suggested fields:

- `id String @id @default(uuid())`
- `issuerTenantId String?`
- `counterpartyTenantId String?`
- `platformSide String?` // uprm_treasury | uprm_clearing | null
- `flowType String` // reward_issue | wallet_topup | cross_tenant_redemption | payout_reserve | payout_send | payout_release | reversal | migration
- `direction String` // payable | receivable | internal
- `amountCredits BigInt`
- `referenceType String?`
- `referenceId String?`
- `status String @default("open")` // open | settled | cancelled
- `createdAt DateTime @default(now())`
- `settledAt DateTime?`
- `updatedAt DateTime @updatedAt`

Suggested constraints/indexes:

- index `[issuerTenantId, createdAt]`
- index `[counterpartyTenantId, createdAt]`
- index `[status, createdAt]`
- index `[flowType, createdAt]`
- index `[referenceType, referenceId]`

Notes:

- this is the internal ecosystem clearing ledger, not the user wallet itself

#### 8. FX quote / conversion snapshot

Add `FxQuote`.

Purpose:

- captures the exact conversion used when non-EUR value enters or exits the system

Suggested fields:

- `id String @id @default(uuid())`
- `baseCurrency String` // e.g. EUR
- `quoteCurrency String` // e.g. USD
- `rateDecimal String` // store losslessly as string/decimal depending Prisma support
- `effectiveAt DateTime`
- `provider String`
- `sourceReferenceType String?`
- `sourceReferenceId String?`
- `createdAt DateTime @default(now())`

Notes:

- used only at fiat ingress/egress boundaries
- after conversion, internal accounting continues in Credits only

### Existing model changes

#### 9. Extend `PayoutRequest`

Current fields:

- `tenantId`
- `tenantUserId`
- `amountMinor`
- `baseCurrency`

Target changes:

- keep old fields during migration
- add:
  - `userId String?`
  - `amountCredits BigInt?`
  - `walletAccountId String?`
  - `issuerBreakdownJson Json?`
  - `fxQuoteId String?`

Purpose:

- payouts must move from tenant-scoped balance to global Credit wallet while preserving issuer provenance

#### 10. Extend or version `SettlementCycle`

Recommended path: introduce Settlement V2 fields in the same model first; version later only if needed.

Add fields:

- `fundedWalletLiabilityCredits BigInt @default(0)`
- `pendingRewardLiabilityCredits BigInt @default(0)`
- `payoutReservedLiabilityCredits BigInt @default(0)`
- `crossTenantReceivableCredits BigInt @default(0)`
- `crossTenantPayableCredits BigInt @default(0)`
- `netSettlementPositionCredits BigInt @default(0)`
- `displayEurMinor BigInt?` // optional convenience only
- `settlementVersion String @default("v2")`

Keep current fields for back-compat during migration:

- `ledgerLiabilityMinor`
- `pendingLiabilityMinor`
- `totalLiabilityMinor`

Notes:

- eventually rename UI wording from “minor” to “Credits” once cutover is complete

#### 11. Extend reporting daily aggregates

Current daily models are tenant-liability oriented and fiat-named.

Add or version daily reporting for Credits:

- `TenantLiabilityDailyV2` or extend `TenantLiabilityDaily` with:
  - `fundedWalletLiabilityCredits`
  - `pendingRewardLiabilityCredits`
  - `payoutReservedLiabilityCredits`
  - `crossTenantReceivableCredits`
  - `crossTenantPayableCredits`
  - `netSettlementPositionCredits`
  - `displayEurMinor`

Recommendation:

- prefer additive V2 reporting model to avoid corrupting interpretation of old daily rows

---

## Wallet models and service boundaries

Create a new domain package:

- `packages/domain/wallet`

### Core services

#### `WalletAccountService`

Responsibilities:

- get/create global wallet account by `userId + currency`
- fetch wallet balance summary
- fetch wallet detail and grant lots

#### `WalletGrantService`

Responsibilities:

- grant Credits into wallet
- create provenance lots
- expire/reverse grant lots
- compute funded unredeemed totals by issuer tenant

#### `WalletAllocationService`

Responsibilities:

- allocate Credits from grant lots FIFO
- support reservation then finalization
- support release/reversal to original lots

#### `WalletRedemptionService`

Responsibilities:

- reserve Credits for purchase
- finalize posted redemption
- release reservation on failed checkout
- reverse redemption on refund
- create `TenantClearingEntry` rows for cross-tenant spend

#### `WalletPayoutService`

Responsibilities:

- reserve Credits for payout from global wallet
- finalize payout send
- release failed/cancelled payout back into lots
- keep issuer provenance intact across reservations

#### `WalletFxService`

Responsibilities:

- accept external fiat amounts
- fetch/store FX quote snapshots
- normalize inbound value into EUR then Credits
- expose audit trails for conversion

### Reading rule

All user-facing balance reads must eventually come from:

- `WalletAccount` + grant/reservation state

not from:

- tenant-scoped `ledger_accounts.user_balance`

### Compatibility rule

During migration, old tenant-scoped `user_balance` remains available for parity and legacy reporting only.

---

## FX conversion boundary

This must be explicit and narrow.

### Rule

All external money crosses one normalization boundary before entering canonical accounting.

### Inbound money flow

Example: user pays `12.34 USD`

Steps:

1. capture original input amount and source currency
2. load or compute FX quote against EUR
3. convert USD -> EUR using the stored quote
4. round to EUR cents according to explicit policy
5. mint/store the resulting amount as Credits 1:1 with EUR cents
6. persist the `FxQuote` used for the operation
7. from this point onward, use only Credits internally

### Outbound/payout flow

If the platform later pays out in a destination fiat currency:

1. source canonical amount = Credits
2. convert Credits -> EUR cents 1:1
3. if destination currency != EUR, apply stored payout FX quote at egress
4. keep the canonical internal ledger amount in Credits regardless of payout rail currency

### Rounding policy to lock before implementation

Must be written into the code and docs before rollout:

- recommend banker’s rounding or deterministic half-up at the EUR-cent boundary
- never round twice across multiple steps
- conversion to Credits happens only after the EUR-cent amount is finalized

### Non-goals for V1

- do not keep multiple internal wallet currencies
- do not calculate reward schedules directly in source fiat after ingress
- do not let tenants choose their own internal wallet currency

---

## Settlement V2 meaning

Settlement V2 must stop meaning only:

- posted tenant reward balance
- pending scheduled reward postings

It must instead answer:

- what tenant-funded Credits remain unredeemed?
- what pending rewards will become funded Credits?
- what payout-reserved obligations are still unresolved?
- what cross-tenant receivable/payable exists?
- what is the net settlement position?

### Settlement V2 fields explained

#### `fundedWalletLiabilityCredits`

- Credits already granted into users’ global wallets
- still unredeemed
- still not fully discharged
- attributable to this tenant as issuer/funder

#### `pendingRewardLiabilityCredits`

- reward Credits computed/scheduled but not yet granted into wallet

#### `payoutReservedLiabilityCredits`

- Credits reserved for payout from grants funded by this tenant
- no longer spendable by user
- still owed until payout is sent or released

#### `crossTenantReceivableCredits`

- Credits this tenant accepted from users that were funded by another tenant or platform source
- value this tenant should receive through clearing

#### `crossTenantPayableCredits`

- Credits this tenant funded that were redeemed at another tenant
- value this tenant owes into clearing

#### `netSettlementPositionCredits`

Recommended formula:

- `(fundedWalletLiabilityCredits + pendingRewardLiabilityCredits + payoutReservedLiabilityCredits + crossTenantPayableCredits) - crossTenantReceivableCredits`

Validate final formula carefully during implementation against finance semantics.

### UI direction for Settlement V2

Replace current V1 wording over time with:

- Funded wallet liability
- Pending reward liability
- Payout reserved
- Cross-tenant receivable
- Cross-tenant payable
- Net settlement position

Display format:

- `211200 Credits (2112 €)`

Do not keep fiat primary in the UI after V2 cutover.

---

## Migration phases

Roll out in hard phases. Do not skip parity steps.

### Phase 0 — design lock and policy docs

Objective:

- freeze product/accounting semantics before schema work

Steps:

1. document `Credit` as canonical internal currency
2. document FX rounding/quote policy
3. document issuer/spender/platform clearing semantics
4. document wallet lot consumption policy (recommend FIFO)
5. document payout reservation semantics

Verification:

- written policy doc reviewed by stakeholders
- no code changes yet

### Phase 1 — additive schema migration

Objective:

- add new wallet/clearing/fx schema without changing live reads

Files:

- Modify: `packages/db/prisma/schema.prisma`
- Create: new Prisma migration under `packages/db/prisma/migrations/...`

Steps:

1. add `WalletAccount`
2. add `WalletGrant`
3. add `WalletRedemption`
4. add `WalletRedemptionAllocation`
5. add `WalletPayoutReservation`
6. add `WalletPayoutAllocation`
7. add `TenantClearingEntry`
8. add `FxQuote`
9. extend `PayoutRequest`
10. extend `SettlementCycle` with V2 fields

Verification:

- prisma generate
- migration deploy in local/dev
- schema tests/builds pass

### Phase 2 — wallet domain package skeleton

Objective:

- create canonical wallet services without altering production flows yet

Files:

- Create: `packages/domain/wallet/*`
- Create tests for each service

Steps:

1. create `WalletAccountService`
2. create `WalletGrantService`
3. create `WalletAllocationService`
4. create `WalletRedemptionService`
5. create `WalletPayoutService`
6. create `WalletFxService`
7. build unit tests around grant creation, FIFO allocation, reservation/release, and FX normalization

Verification:

- `pnpm --filter @uprm/wallet test`
- `pnpm --filter @uprm/wallet build`

### Phase 3 — dual-write rewards into wallet grants

Objective:

- keep old tenant reward balances live while shadow-writing the new wallet truth

Files:

- Modify: rewards scheduling/posting services
- Modify: manual adjustment paths
- Possibly modify: event ingestion linkage

Steps:

1. on reward posting, also create wallet grant(s)
2. on manual positive/negative adjustment, also create wallet grant/reversal entries
3. record issuer tenant + source event + tenant user provenance
4. create parity checks comparing old tenant reward balances to new wallet-funded amounts

Verification:

- dual-write tests
- parity reports with zero unexplained drift

### Phase 4 — global wallet read APIs behind feature flag

Objective:

- expose the new balance truth without yet switching every flow

Files:

- Modify: `apps/api-core/src/users/users.controller.ts`
- Modify: admin user detail/read surfaces

Steps:

1. resolve `TenantUser -> User`
2. add a feature flag for wallet-v2 reads
3. return global Credit balance from wallet services when enabled
4. keep old tenant-scoped balance available in admin diagnostics during migration

Verification:

- user balance API tests for old and new paths
- admin detail parity output available

### Phase 5 — move payouts from tenant balance to global wallet reservations

Objective:

- payout requests reserve from the global wallet, not tenant-scoped `user_balance`

Files:

- Modify: `packages/domain/payouts/*`
- Modify: `apps/api-core/src/users/users.controller.ts`
- Modify: admin payout handling if needed

Steps:

1. payout request uses wallet allocation/reservation
2. create `WalletPayoutReservation` + allocation rows
3. create clearing entries if issuer attribution matters
4. keep payout send/fail/cancel semantics aligned
5. ensure settlement V2 counts payout-reserved amounts as still owed

Verification:

- payout tests for reserve/send/fail/cancel
- settlement V2 snapshot tests include payout-reserved bucket

### Phase 6 — implement direct Credit spend in checkout/purchase flows

Objective:

- allow user to spend global Credits system-wide

Files:

- Modify: `apps/api-core/src/billing/*`
- Modify: relevant tenant product/purchase/order flows
- Modify: webhook/event ingestion or order completion hooks

Steps:

1. add `applyCredits` / `creditsToUse` to checkout request model
2. reserve Credits before payment completion
3. reduce Stripe external charge by reserved Credits if partial payment
4. on successful purchase, finalize redemption
5. on failure/cancel, release reservation
6. write `TenantClearingEntry` rows from issuer lot allocations
7. define and implement refund reversal semantics

Verification:

- checkout tests for full-credit purchase
- checkout tests for partial-credit purchase
- cancellation/release tests
- refund reversal tests

### Phase 7 — Settlement V2 computation and reporting

Objective:

- replace the old simplistic settlement snapshot with real obligation buckets

Files:

- Modify: `packages/domain/settlements/src/settlement.service.ts`
- Modify: settlement controller/admin-web types/UI
- Modify/create reporting daily aggregate jobs/models

Steps:

1. compute funded wallet liability by issuer tenant
2. compute pending reward liability from scheduled reward pipeline
3. compute payout-reserved liability from wallet payout reservations
4. compute cross-tenant receivable/payable from clearing entries
5. compute net settlement position
6. write Settlement V2 snapshots
7. update admin UI terminology and display format to Credits-first

Verification:

- unit tests for each bucket
- admin API tests for V2 detail/list shape
- admin-web display tests/build

### Phase 8 — cut over reads and retire tenant-scoped reward balance as primary truth

Objective:

- remove the old balance model as source-of-truth

Steps:

1. stop using tenant-scoped `user_balance` for user-facing reward wallet reads
2. keep legacy tenant-scoped ledger only as compatibility/reporting bridge if still needed
3. migrate settlements to V2 default
4. remove obsolete V1-only UI wording and API assumptions
5. deprecate old parity/debug paths after sustained stability window

Verification:

- one migration checklist proving every user-facing balance read is global-wallet based
- no production endpoints still depending on tenant-scoped reward wallet semantics except explicitly documented legacy endpoints

---

## Testing and proof strategy

### Schema proof

- prisma generate passes
- migration applies cleanly
- new models visible in generated client

### Domain proof

- wallet package unit tests for:
  - grant creation
  - FIFO allocation
  - spend reservation/posting/release
  - payout reservation/send/release
  - FX conversion to Credits
  - clearing entry generation

### API proof

- user balance endpoint returns global Credits balance
- checkout can reserve/finalize Credits
- payout path consumes global Credits correctly
- settlement endpoints expose V2 buckets

### Reporting proof

- tenant-funded unredeemed amounts match wallet-grant residuals
- payout-reserved amounts remain visible in settlement snapshots
- cross-tenant spend produces matching payable/receivable pairs

### Live proof bundle after implementation phases

1. user earns on PSI
2. wallet shows Credits globally
3. user spends at another tenant
4. global wallet decreases
5. issuer tenant settlement shows funded liability decrease / payable effect
6. spender tenant settlement shows receivable effect
7. payout reservation keeps amount non-spendable but still owed

---

## Critical pitfalls to avoid

1. Do not make EUR the internal truth and merely label it as Credits.
   - convert at ingress, then stay in Credits.

2. Do not lose issuer provenance when merging into a global wallet.
   - every grant lot must retain issuer tenant.

3. Do not debit wallet directly at checkout creation.
   - reserve first, finalize on successful purchase.

4. Do not let payout reservation disappear from settlement obligations.
   - reserved-for-payout is still owed until sent.

5. Do not attempt a big-bang cutover.
   - dual-write and parity-check first.

6. Do not collapse all settlement meaning into one total too early.
   - keep explicit buckets for finance truth.

7. Do not let tenant-spender acceptance happen without a clearing entry.
   - cross-tenant spend without clearing is hidden liability drift.

---

## Recommended first implementation slice

Start with the smallest durable slice that proves the target architecture:

1. add wallet schema
2. implement wallet package
3. dual-write reward grants into global wallet
4. expose read-only global balance in admin diagnostics
5. prove parity against current tenant reward balances

Do not start with checkout redemption first.
The wallet and provenance model must exist before system-wide spend is safe.

---

## Final design summary

Move from:

- tenant-scoped reward balances in fiat-named liability fields

to:

- one global UPRM Credit wallet per `User`
- provenance lots showing which tenant funded each Credit
- reservation-based spend and payout flows
- FX normalization only at system boundaries
- Settlement V2 that reports real obligation buckets in Credits first

This is the clean path to: earn on PSI and other tenants, spend UPRM system-wide.
