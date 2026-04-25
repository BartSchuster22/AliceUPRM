# Phase 10 Continuation — SDK + PSI Cutover Hardening Implementation Plan

> For Hermes: use subagent-driven-development discipline while executing this plan task-by-task, but keep the live VPS repo at /srv/uprm as the source of truth and validate each step before moving on.

Goal: finish the remaining practical Phase 10 work for UPRM by adding the missing PSI-facing client SDK, reconciling the live contract against the original roadmap, and completing a production-safe PSI cutover/hardening plan without redoing already-finished Phase 8/9 work.

Architecture: treat current live UPRM as an already-advanced platform, not a fresh Phase 10 starting point. Build a typed SDK around the routes that actually exist today, add or adjust only the minimum missing API surface needed for PSI, and keep PSI migration/cutover work as a separate, explicit track after the contract is stabilized. Do not mix unfinished promoter/settlement backlog into the PSI cutover track.

Tech stack: TypeScript monorepo, NestJS apps, workspace packages, Prisma/Postgres, HMAC tenant auth, existing Stripe Payment Hub, current GitHub repo at /srv/uprm, plus the separate PSI repo once its live path is re-confirmed during execution.

---

## Verified live-state baseline for this plan

This plan is based on live repo/runtime/DB verification, not on stale historical snapshots.

Already implemented and therefore NOT the target of this continuation plan:

- Phase 8 admin backoffice baseline
- Phase 9.1 outbound webhooks
- Phase 9.2 fraud cases and reward holds
- Phase 9.3 reporting analytics read models
- direct Stripe billing authority in UPRM
- upstream billing and identity seam work already partially advanced

Verified current UPRM facts:

- repo root: `/srv/uprm`
- current main tip during planning: `d231b92 feat: complete direct stripe billing authority in uprm`
- dirty docs during planning: `UPRM_As_Built.md`, `UPRM_Implementation_Guide.md`
- worker/runtime healthy on ports `4000/4001/4002`
- live tables include `webhook_deliveries`, `risk_signals`, `risk_cases`, `reward_holds`, `conversion_daily`, `reward_performance_daily`, `tenant_liability_daily`, `cohort_retention_daily`

Verified unfinished or not-yet-proven areas relevant to Phase 10:

- no `packages/clients/uprm-client` package exists yet
- promoter applications remain placeholder-only
- settlement cycles remain placeholder-only
- full PSI parallel-write/cutover proof is not yet recorded as complete

Guiding rule for this phase:

- build only what is still actually missing
- do not re-open completed Phase 8/9 implementation tracks unless verification finds a real contract gap

---

## Scope for this continuation phase

This plan covers four things only:

1. establish the canonical live UPRM contract for PSI integration
2. implement `packages/clients/uprm-client`
3. close any minimal UPRM API gaps required by that SDK and by current PSI usage
4. define and execute PSI cutover hardening in a staged, verifiable way

This plan does NOT include as core scope:

- promoter applications product workflow
- settlement cycle product workflow
- speculative second-tenant features
- redesigning already-live fraud/reporting/webhook domains

Those stay separate backlog tracks unless a true Phase 10 dependency forces a small change.

---

## Task 1: Freeze the live contract baseline before coding

Objective: turn the current live UPRM state into an explicit integration baseline so SDK work targets reality instead of roadmap assumptions.

Files:

- Modify: `UPRM_As_Built.md`
- Modify: `UPRM_Implementation_Guide.md`
- Create: `docs/integration/phase-10-contract-baseline.md`

Step 1: Document the UPRM routes that are already live and PSI-relevant.

At minimum include the routes already verified in source/runtime:

- `POST /v1/users`
- `GET /v1/users/:id`
- `GET /v1/users/:id/balance`
- `POST /v1/referrals/codes`
- `GET /v1/referrals/codes/:code`
- `POST /v1/referrals/apply`
- `POST /v1/events`
- `POST /v1/billing/checkout-sessions` if mounted in current source

Step 2: Explicitly mark roadmap-vs-live mismatches.

Document these facts:

- roadmap asks for `UprmClient.createUser`, `linkTenantUser`, `createReferralCode`, `applyReferralCode`, `submitEvent`, `getWallet`, `getPromoterStatus`
- live UPRM already has create-user semantics via `POST /v1/users`
- live balance endpoint is the real wallet read path today
- promoter status may still be incomplete because promoter/product surfaces are not fully implemented
- `linkTenantUser` may need to map to current find-or-create semantics instead of a brand-new route

Step 3: Record unresolved contract questions as explicit checkboxes instead of silent assumptions.

Examples:

- whether PSI needs a dedicated `linkTenantUser` route or can use `createUser`
- whether a promoter-status endpoint exists or must be deferred
- whether PSI needs profile/subscription helper methods in the SDK because current seam work already uses them

Verification:

- docs state exactly what is live, what is missing, and what is intentionally deferred
- no claim in the baseline doc contradicts current `/srv/uprm` source

Commit hint:

- `docs: freeze phase 10 live contract baseline`

---

## Task 2: Locate and map the PSI integration surface before touching PSI code

Objective: discover the real PSI repo path and the actual seam entrypoints that will consume the SDK, instead of guessing from the roadmap.

Files:

- Create: `docs/integration/psi-seam-inventory.md`
- External inspection target: PSI repo path on the VPS, to be discovered at execution time

Step 1: Locate the live PSI repo and confirm the authenticated git remote.

Record:

- repo path
- active branch
- current remote
- whether the repo is clean or mixed

Step 2: Inventory the PSI entrypoints that already call or should call UPRM.

Expected areas to inspect in PSI:

- signup/register flow
- login/auth reconciliation flow
- referral-code application flow
- order/checkout creation flow
- payment webhook handling
- profile/subscription retrieval used by PSI product logic

Step 3: Write an inventory that maps each PSI action to one of three states:

- already backed by UPRM seam logic
- partially backed by UPRM seam logic
- still local to PSI

Step 4: Capture exact PSI file paths once discovered.

Do not begin SDK consumption work until this inventory exists.

Verification:

- every PSI business-critical identity/payment/referral entrypoint has an owner and a current state
- exact PSI file paths are recorded in the inventory doc

Commit hint:

- `docs: add psi seam inventory for phase 10`

---

## Task 3: Scaffold the missing uprm-client package

Objective: create the reusable SDK package that the roadmap expected but the live repo still lacks.

Files:

- Create: `packages/clients/uprm-client/package.json`
- Create: `packages/clients/uprm-client/tsconfig.json`
- Create: `packages/clients/uprm-client/vitest.config.ts`
- Create: `packages/clients/uprm-client/src/index.ts`
- Create: `packages/clients/uprm-client/src/types.ts`
- Create: `packages/clients/uprm-client/src/http.ts`
- Create: `packages/clients/uprm-client/src/signing.ts`
- Create: `packages/clients/uprm-client/src/uprm-client.ts`
- Create: `packages/clients/uprm-client/src/uprm-client.test.ts`
- Modify: root workspace files as needed so the package is part of the monorepo graph

Step 1: add a minimal package exposing `UprmClient`.

Constructor shape:

- `baseUrl`
- `apiKeyId`
- `apiKeySecret`
- optional retry settings
- optional fetch implementation override for tests

Step 2: implement request signing in one place.

Requirements:

- generate HMAC auth header matching current UPRM tenant API expectations
- include timestamp handling
- support JSON request bodies consistently
- include idempotency-key generation for side-effecting requests

Step 3: implement shared HTTP wrapper behavior.

Requirements:

- parse JSON responses safely
- retry only on retryable transport / 5xx failures
- exponential backoff with capped attempts
- preserve idempotency keys across retries
- surface upstream status codes and response bodies clearly

Verification:

- package builds in isolation
- unit tests pass for header generation, retry behavior, and idempotency reuse

Commit hint:

- `feat: scaffold uprm client sdk package`

---

## Task 4: Implement only the SDK methods supported by the real live UPRM surface

Objective: make the SDK useful immediately against today’s UPRM without inventing unsupported methods.

Files:

- Modify: `packages/clients/uprm-client/src/types.ts`
- Modify: `packages/clients/uprm-client/src/uprm-client.ts`
- Modify: `packages/clients/uprm-client/src/uprm-client.test.ts`
- Modify if needed: `docs/integration/phase-10-contract-baseline.md`

Step 1: implement methods that map directly to verified live endpoints.

Minimum first slice:

- `createUser()` -> `POST /v1/users`
- `createReferralCode()` -> `POST /v1/referrals/codes`
- `applyReferralCode()` -> `POST /v1/referrals/apply`
- `submitEvent()` -> `POST /v1/events`
- `getWallet()` -> `GET /v1/users/:id/balance`

Step 2: add live-seam helper methods only if already supported by source.

Candidate methods if supported by current source:

- `getUser()`
- `getUserProfileByExternalUserId()`
- `getSubscriptionsByExternalUserId()`
- `createCheckoutSession()`

Step 3: do NOT ship fake methods.

Rules:

- if `getPromoterStatus` has no real server contract yet, omit it and document it as deferred
- if `linkTenantUser` is already covered by `createUser` semantics, document that mapping instead of creating a second redundant method
- if PSI requires a truly missing route, defer implementation to Task 5 before exposing the SDK method

Verification:

- each SDK method is backed by a currently mounted UPRM route
- test fixtures verify method path, method verb, request shape, and response parsing

Commit hint:

- `feat: implement live uprm client methods`

---

## Task 5: Close the minimum UPRM API gaps required for PSI

Objective: add or adjust only the smallest server-side contract changes needed to make the SDK cover the real PSI seam.

Files:

- Modify only after Task 2 inventory proves necessity
- Likely candidates in `/srv/uprm`:
  - `apps/api-core/src/users/users.controller.ts`
  - `apps/api-core/src/referrals/referrals.controller.ts`
  - `apps/api-core/src/billing/billing.controller.ts`
  - DTOs under those modules
  - domain services only if a genuine contract gap exists
- Modify: `packages/clients/uprm-client/src/types.ts`
- Modify: `packages/clients/uprm-client/src/uprm-client.ts`

Allowed examples:

- expose a missing read helper route already supported by domain logic
- add a stable response shape that PSI actually needs
- add an explicit checkout helper if the current response contract is insufficient

Disallowed examples:

- broad product redesign during contract work
- promoter workflow expansion just to satisfy a speculative roadmap method
- settlement-cycle work mixed into Phase 10

Verification:

- every new route is justified by the PSI seam inventory
- app tests/builds pass for the changed API package
- SDK tests are updated to reflect the final contract

Commit hint:

- `feat: close minimum phase 10 api gaps`

---

## Task 6: Add integration docs and sample usage for PSI

Objective: make the SDK usable by PSI without reverse-engineering the auth contract again.

Files:

- Create: `docs/integration/psi.md`
- Create: `packages/clients/uprm-client/README.md`
- Modify: `packages/clients/uprm-client/src/index.ts`

Documentation must include:

- constructor configuration
- how HMAC signing works at a high level
- example calls for create user, apply referral code, submit event, get wallet, create checkout session if supported
- retry + idempotency behavior
- known deferred methods and why they are deferred
- migration note that current promoter/settlement product workflows are not part of this SDK phase

Verification:

- a PSI developer can integrate the package without reading server internals
- all examples use method names that actually exist in the SDK

Commit hint:

- `docs: add psi integration guide for uprm client`

---

## Task 7: Add an end-to-end dev integration test for the SDK

Objective: prove the new client can drive the real UPRM lifecycle safely.

Files:

- Create: `packages/clients/uprm-client/src/uprm-client.integration.test.ts`
- Create or modify supporting test helpers under the package as needed
- Modify repo test docs if command shape needs explanation

Test flow target:

- create or fetch tenant user
- create/apply referral code where needed
- submit paid event or current canonical billing event path
- verify wallet/balance response
- if current dev setup supports it, include a compensating event path such as refund/chargeback-linked flow

Important rule:

- use synthetic/local test identifiers only
- do not point integration tests at live PSI production-like IDs

Acceptance target for this task:

- the SDK can drive at least the signup/pay/balance lifecycle against a dev stack without duplicate side effects under retried requests

Commit hint:

- `test: add phase 10 uprm client integration coverage`

---

## Task 8: Execute PSI adoption in a staged seam-first rollout

Objective: switch PSI to the SDK in the lowest-risk order, based on the real seam inventory.

Files:

- External PSI repo files: exact paths to be filled in from `docs/integration/psi-seam-inventory.md`
- Create in UPRM repo: `docs/migration/psi-cutover.md`
- Create if needed in UPRM repo: `docs/migration/psi-reconciliation-report-template.md`

Recommended rollout order:

1. read-only helpers first
   - wallet/profile/subscription reads
2. referral helpers next
3. event submission next
4. checkout/session creation next
5. webhook/cutover validation last

For each PSI seam point:

- replace direct handcrafted UPRM calls with `UprmClient`
- remove duplicate signing logic from PSI once the SDK is in place
- preserve exact upstream status handling
- keep feature flags or fallback toggles where necessary for safe rollback

Verification:

- each replaced PSI seam point is mapped in the inventory doc from “partial/local” to “SDK-backed”
- no PSI endpoint silently falls back to fake/mock behavior when UPRM is configured

Commit hint:

- done in the PSI repo, likely as multiple small commits rather than one mega-change

---

## Task 9: Prove cutover safety with explicit reconciliation and a go/no-go checklist

Objective: convert “partially advanced seam work” into a production-safe Phase 10 completion record.

Files:

- Create: `docs/migration/psi-cutover.md`
- Create: `docs/migration/psi-parallel-write-reconciliation.md`
- Modify: `UPRM_As_Built.md`

Cutover proof requirements:

- define PSI-vs-UPRM comparison queries and counts
- compare user counts
- compare tenant-user mappings
- compare referral-edge counts
- compare reward-trigger event counts
- compare reward/ledger outcome counts relevant to the seam being migrated
- compare checkout ownership behavior and webhook ingress ownership

Minimum go/no-go checklist sections:

- prerequisites
- migration/backfill status
- feature flags/toggles
- rollback path
- reconciliation metrics
- final cutover steps
- post-cutover watch window

Important rule:

- if one-week parallel write is not operationally practical right now, document the exact shorter proof window used and the remaining risk explicitly instead of pretending the roadmap acceptance criterion was met fully

Verification:

- there is a written, reproducible reconciliation method
- cutover evidence is stored in docs, not only in chat memory

Commit hint:

- `docs: add psi cutover and reconciliation runbook`

---

## Task 10: Close the phase with a reality-based status update

Objective: mark what Phase 10 actually achieved and what remains intentionally out of scope.

Files:

- Modify: `UPRM_As_Built.md`
- Modify: `UPRM_Implementation_Guide.md`

The final status update must distinguish:

- completed Phase 10 SDK work
- completed PSI seam migrations
- proven cutover/hardening work
- still-deferred product areas:
  - promoter applications
  - settlement cycles
  - any promoter-status API not yet backed by a real domain surface

Verification:

- the next person reading the repo is not misled into redoing completed Phase 8/9 work or assuming promoter/settlement work is part of completed Phase 10

Commit hint:

- `docs: finalize phase 10 continuation status`

---

## Recommended execution order

P0

- Task 1: freeze live contract baseline
- Task 2: PSI seam inventory

P1

- Task 3: scaffold SDK package
- Task 4: implement live SDK methods
- Task 5: close minimum UPRM API gaps
- Task 6: integration docs
- Task 7: dev integration test

P2

- Task 8: staged PSI adoption
- Task 9: reconciliation + cutover proof
- Task 10: final status update

---

## Hard phase boundaries

This continuation plan is successful only if all of the following are true:

- UPRM gains a real reusable `uprm-client` package
- PSI integration targets the real live contract, not stale roadmap assumptions
- cutover evidence is written down as repo docs
- promoter/settlement backlog is kept separate unless a proven dependency appears

This continuation plan fails if it turns into any of the following:

- redoing already-complete Phase 8/9 work
- adding SDK methods for routes that do not exist
- silently assuming PSI repo paths or seam entrypoints without inspection
- mixing unrelated unfinished admin workflows into the cutover track
