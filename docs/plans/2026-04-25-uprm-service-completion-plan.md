# UPRM Service Completion Plan

> For Hermes: execute this plan against live `/srv/uprm` as the source of truth. Do not use PSI integration state as the measure of UPRM completion.

Goal: finish UPRM as a standalone multi-tenant service so it can be considered complete on its own terms before tenant cutover work resumes.

Architecture: treat UPRM completion as service-internal completeness, not tenant-adapter completeness. Preserve already-completed identity, event ingestion, ledger, reward scheduling, fraud/risk, webhook delivery, reporting, payout, and checkout/product-registration work. Focus only on domains that are still placeholder-only or structurally incomplete in UPRM itself.

Tech stack: NestJS modular monolith, TypeScript workspace packages, Prisma/Postgres, Redis, RabbitMQ, systemd services, Docker support stack.

---

## Verified live status at planning time

Already implemented and live:
- tenant API core (`/v1/users`, referrals, events, payouts, balance, checkout-sessions)
- worker runtime, scheduler logic, ledger, rewards, payouts
- outbound webhooks
- fraud/risk cases and reward holds
- reporting read models and reporting module
- shared UPRM client package
- tenant product registration + `productRef` checkout

Verified unfinished domains:
- `apps/admin-api/src/promoters/promoter-applications.controller.ts`
  - returns `status: 'not_implemented_yet'`
- `apps/admin-api/src/settlements/settlement-cycles.controller.ts`
  - returns `status: 'not_implemented_yet'`
- corresponding modules are controller-only stubs, with no real service/domain package behind them

Repo/runtime state at planning time:
- `/srv/uprm` branch `main`
- ahead of origin by 4 commits
- clean working tree
- systemd services healthy
- live runtime includes `/v1/products/register`

---

## Completion definition

UPRM can be considered service-complete for the current roadmap when all of these are true:

1. no roadmap-critical admin/API domains are still placeholder-only
2. promoter workflow exists as a real domain, not a stub
3. settlement cycle workflow exists as a real domain, not a stub
4. current completed domains continue to build, test, and run after those additions
5. docs reflect the new completion state accurately

This plan intentionally excludes tenant cutover, PSI wiring, and broader consumer integration work.

---

## P0 — Finish placeholder-only roadmap domains

### P0.1 Promoter applications domain

Objective: replace the current `not_implemented_yet` admin surface with a real promoter-application workflow.

Minimum completion target:
- persistent promoter-application model(s) in Prisma
- admin-api list/detail/decision endpoints backed by real data
- service/package ownership for promoter application logic
- audit trail for approve/reject/review actions
- tests for controller/service behavior

Likely files:
- `packages/db/prisma/schema.prisma`
- new migration under `packages/db/prisma/migrations/*`
- new package under `packages/domain/promoter/*` or equivalent live location
- `apps/admin-api/src/promoters/promoter-applications.controller.ts`
- DTOs/module/service wiring under `apps/admin-api/src/promoters/*`

Verification:
- admin route no longer returns placeholder payload
- package/app builds pass
- target tests pass
- live restart succeeds

### P0.2 Settlement cycles domain

Objective: replace the current `not_implemented_yet` settlement surface with a real settlement-cycle workflow.

Minimum completion target:
- persistent settlement-cycle model(s)
- admin list/detail/open/close or equivalent cycle-control operations
- linkage to current ledger/liability state where needed
- audit trail for settlement actions
- tests for controller/service behavior

Likely files:
- `packages/db/prisma/schema.prisma`
- new migration under `packages/db/prisma/migrations/*`
- new package under `packages/domain/treasury/*` or `packages/domain/settlements/*`
- `apps/admin-api/src/settlements/settlement-cycles.controller.ts`
- DTOs/module/service wiring under `apps/admin-api/src/settlements/*`

Verification:
- admin route no longer returns placeholder payload
- package/app builds pass
- target tests pass
- live restart succeeds

---

## P1 — Hardening and completion proof

### P1.1 Regression verification across already-complete domains

Objective: prove promoter/settlement additions did not regress existing UPRM service behavior.

Must re-verify:
- worker health and metrics
- tenant API build
- admin-api build
- worker build
- fraud/risk routes still operational
- reporting routes/tables still operational
- product registration + checkout-sessions still mounted

### P1.2 Docs truth correction

Objective: update repo-local docs so completion status is no longer ambiguous.

Files:
- `UPRM_As_Built.md`
- `UPRM_Implementation_Guide.md`
- this plan file or a successor completion snapshot

Outcome:
- docs should clearly state which roadmap phases are complete and which are intentionally outside current scope

---

## P2 — Optional post-completion polish

These are not blockers for calling UPRM complete if P0 and P1 are done:
- additional admin UX refinement
- broader tenant onboarding ergonomics
- future multi-tenant product polish beyond current contract
- PSI-specific or other-tenant integration work

---

## Current exact verdict

YES:
- UPRM is already advanced and internally substantial
- most major service domains are real and populated live
- promoter workflow is now a real domain, with manual application review and live auto-qualification runtime wiring
- settlement cycle workflow is now a real domain, with persistent settlement cycles and admin list/detail/open/close routes

NO:
- the earlier placeholder verdict in this plan is no longer current

Therefore the correct next implementation target is:
- regression proof + docs completion
