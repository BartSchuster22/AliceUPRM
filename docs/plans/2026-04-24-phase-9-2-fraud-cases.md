# Phase 9.2 Fraud Signals & Case Workflow Implementation Plan

> For Hermes: use subagent-driven-development discipline while executing this plan task-by-task, but keep the live VPS repo at /srv/uprm as the source of truth and validate each step before moving on.

Goal: implement the first production-safe fraud workflow for UPRM so the system can emit weighted risk signals, automatically open risk cases, hold affected in-flight rewards, and let reviewers resolve cases from the admin UI.

Architecture: keep this inside the modular monolith. Persist fraud state in new Prisma tables, encapsulate rules and hold/release logic in a dedicated domain package, trigger signal creation from real reward/event flows, and expose a thin admin API + admin web queue for review actions. Do not let other modules read fraud tables directly without going through the fraud domain service.

Tech stack: Prisma/Postgres, TypeScript workspace packages, NestJS admin-api, React admin-web, existing worker loop where polling is needed, Vitest/Jest according to existing package/app conventions.

---

## Scope for this phase

Required by the guide:

1. Emit signals for: self-referral attempt, referral velocity, high refund ratio in a cluster, same payment fingerprint, same IP multiple signups.
2. Weight signals via tenant fraud_config_json and open risk_cases once threshold is crossed.
3. Opening a case must hold in-flight reward decisions for the affected user.
4. Resolution actions: allow, reject, escalate.
5. Admin reviewer queue UI.
6. Acceptance: held rewards do not unlock while a case is open; allow releases all holds atomically.

Practical slice for this implementation:

- implement the five requested signal types, but only wire live producers where UPRM already has enough data today
- support metadata-only/manual ingestion for signals that need external PSI fields not yet first-class in UPRM (IP, payment fingerprint)
- treat scheduled_postings as the current in-flight reward artifact to hold/release, because that is the real unlock mechanism in the codebase today
- preserve modular boundaries and add explicit service methods instead of ad-hoc fraud queries from controllers

---

## Task 1: Add fraud persistence schema

Objective: create the DB structures needed for signals, cases, case events, and reward holds.

Files:

- Modify: packages/db/prisma/schema.prisma
- Create: packages/db/prisma/migrations/<timestamp>\_fraud_cases/migration.sql

Add models:

- RiskSignal
  - id, tenantId, tenantUserId nullable, signalType, score, severity, status, dedupeKey nullable
  - sourceEventId nullable, metadata Json, createdAt
- RiskCase
  - id, tenantId, tenantUserId nullable, status(open|allowed|rejected|escalated), severity, scoreTotal
  - thresholdSnapshot Json, openedAt, resolvedAt nullable, resolution nullable, resolutionNote nullable
  - openedBySignalId nullable
- RiskCaseEvent
  - id, riskCaseId, actorType(system|admin), actorId nullable, action, beforeJson nullable, afterJson nullable, createdAt
- RewardHold
  - id, tenantId, tenantUserId, scheduledPostingId unique, riskCaseId, status(active|released|rejected)
  - reasonCode, createdAt, releasedAt nullable, rejectedAt nullable

Indexes:

- risk_signals by tenantId + createdAt, tenantUserId + createdAt, signalType + createdAt
- risk_cases by tenantId + status + openedAt and tenantUserId + status
- reward_holds by tenantId + status + createdAt and scheduledPostingId unique

Notes:

- keep scheduled_postings.status unchanged for minimal blast radius; use reward_holds as the hold source of truth
- this lets scheduler skip posting rows that have active holds

Verification:

- Prisma generate succeeds
- DB package typecheck succeeds
- migration SQL is syntactically clean and matches schema names

---

## Task 2: Create fraud domain package

Objective: centralize fraud config parsing, signal scoring, case opening, hold/release/reject logic.

Files:

- Create: packages/domain/fraud/package.json
- Create: packages/domain/fraud/tsconfig.json
- Create: packages/domain/fraud/vitest.config.ts
- Create: packages/domain/fraud/src/index.ts
- Create: packages/domain/fraud/src/config.ts
- Create: packages/domain/fraud/src/types.ts
- Create: packages/domain/fraud/src/fraud.service.ts
- Create: packages/domain/fraud/src/fraud.service.test.ts

Core behavior:

- parse fraud config with safe defaults:
  - enabled boolean true
  - caseThreshold number default 100
  - signalWeights map for each signal type
  - velocityWindowMinutes default 60
  - velocityReferralCountThreshold default 5
  - refundRatioWindowDays default 30
  - refundRatioThreshold default 0.5
  - clusterWindowDays default 30
- recordSignal(input)
  - persist risk_signal
  - compute rolling score for the tenant user over configurable window
  - open a risk_case when threshold is crossed and there is no currently open case for that tenant user
  - when case opens, create reward_holds for matching pending scheduled_postings and case event rows
- listCases(filters)
- getCase(id)
- allowCase(id, actor, note)
  - in one transaction: update case, mark reward_holds released, append case event
- rejectCase(id, actor, note)
  - in one transaction: update case, cancel affected scheduled_postings if still pending, mark reward_holds rejected, append case event
- escalateCase(id, actor, note)
  - set case status escalated and severity higher, append event, keep holds active
- getActiveHoldForScheduledPosting(scheduledPostingId)

Testing:

- opening threshold creates one open case only
- duplicate threshold crossings do not open duplicate active cases
- allow releases all holds atomically
- reject cancels pending scheduled postings atomically

---

## Task 3: Integrate hold gate into reward unlocking

Objective: prevent pending rewards from unlocking while an active fraud hold exists.

Files:

- Modify: packages/domain/rewards/src/scheduled-posting.service.ts
- Modify: packages/domain/rewards/src/scheduled-posting.service.test.ts
- Modify: packages/domain/rewards/package.json

Changes:

- add dependency on @uprm/fraud
- before claiming a due scheduled posting, check whether an active reward_hold exists for that posting
- if held, skip posting and do not change scheduled_postings.status
- expose enough structured result counters to verify held-vs-posted in tests

Tests:

- pending posting with active hold is skipped and remains pending
- releasing the hold allows posting on next scheduler run
- rejecting a case cancels pending rows and they never post later

---

## Task 4: Add initial signal producers

Objective: generate the five requested signal types from current UPRM capabilities.

Files:

- Modify: packages/domain/events/src/ingestion.service.ts
- Modify: packages/domain/events/src/ingestion.service.test.ts
- Modify: packages/domain/rewards/src/scheduled-posting.service.ts (self-referral path if needed)
- Modify: apps/worker/src/rewards/reward-consumer.ts if reward flow is the cleanest current hook
- Create if needed: helper under packages/domain/fraud/src/producers.ts

Producer strategy:

- self_referral_attempt:
  - emit when referred tenant user would reward themselves or when referral ancestry resolves to self
- referral_velocity:
  - emit when a referrer accumulates >N referred signup/payment triggers inside the configured window
- high_refund_ratio_cluster:
  - emit when a referrer/referred cluster exceeds refund ratio threshold based on linked compensating events
- same_ip_multiple_signups:
  - emit when event payload or tenant user metadata provides signup IP and the same IP is reused across multiple signups in the tenant
- same_payment_fingerprint:
  - emit when event payload provides a reusable payment fingerprint seen across multiple tenant users

Important implementation rule:

- if IP/fingerprint data is absent, do not fake a signal; simply do nothing
- store the raw evidence in risk_signal.metadata so reviewers can inspect why the signal fired

Tests:

- event fixtures with metadata trigger IP/fingerprint signals
- refund and velocity fixtures trigger weighted signals
- self-referral path creates a signal without opening duplicates repeatedly

---

## Task 5: Build admin API for fraud queue and actions

Objective: replace the placeholder fraud endpoint with a real reviewer workflow.

Files:

- Modify: apps/admin-api/src/fraud/fraud.module.ts
- Replace/Modify: apps/admin-api/src/fraud/fraud-cases.controller.ts
- Create: apps/admin-api/src/fraud/fraud-cases.controller.spec.ts
- Create: apps/admin-api/src/fraud/dto/list-fraud-cases-query.dto.ts
- Create: apps/admin-api/src/fraud/dto/resolve-fraud-case.dto.ts

Endpoints:

- GET /admin/fraud-cases?tenantId=&status=&severity=
- GET /admin/fraud-cases/:id
- POST /admin/fraud-cases/:id/allow
- POST /admin/fraud-cases/:id/reject
- POST /admin/fraud-cases/:id/escalate

Response payloads should include:

- case summary
- linked signals
- hold count
- recent case events

Audit requirements:

- every mutating reviewer action writes to audit_logs
- action names:
  - fraud.case.allow
  - fraud.case.reject
  - fraud.case.escalate

Tests:

- guarded access and role coverage
- list/detail serialization
- each action writes audit log and calls fraud service correctly

---

## Task 6: Build admin web fraud queue

Objective: replace the placeholder fraud panel with a working reviewer queue.

Files:

- Modify: apps/admin-web/src/api.ts
- Modify: apps/admin-web/src/App.tsx

UI requirements:

- list fraud cases for selected tenant
- filter by status and severity
- show score, openedAt, tenantUserId, reason summary, hold count
- show detail panel with signals and case history
- reviewer note text area and buttons for allow / reject / escalate
- refresh state after action

Validation:

- buttons disabled while request is in flight
- errors shown in the existing status banner

---

## Task 7: Verification and live rollout

Objective: prove Phase 9.2 honestly before shipping.

Verification order:

1. unit tests for fraud package
2. rewards package tests including hold gate
3. events package tests for signal producers
4. admin-api fraud controller tests
5. admin-web build
6. full targeted builds for changed packages/apps
7. apply migration on live DB
8. restart affected services
9. live smoke test:
   - configure PSI tenant fraud config with low threshold and strong weights
   - trigger a self-referral or velocity signal safely on seeded PSI users
   - verify a risk_case opens
   - verify pending scheduled_postings receive active reward_holds
   - verify scheduler does not unlock held rows
   - resolve with allow and verify holds release atomically
   - trigger again and resolve with reject, verifying pending rows cancel
10. commit and push to origin/main

---

## Risks and design notes

- The implementation guide says reward_decisions, but the current codebase uses scheduled_postings as the real in-flight reward unit. This plan intentionally maps holds to scheduled_postings so the behavior is real, not fictional.
- IP and payment fingerprint data are not first-class schema columns today. The plan supports them opportunistically from event payload / metadata now, which is enough for PSI integration later without blocking this phase.
- Do not mutate posted ledger entries for fraud reject in this phase. Reject only cancels in-flight pending rewards. Reversing already-posted rewards remains covered by refund/reversal flows and should be a later extension if needed.
- If the worker needs an explicit fraud polling loop after implementation, add it only if required by the chosen design; prefer synchronous transactional case opening at signal creation time.

---

## Expected files likely to change

- packages/db/prisma/schema.prisma
- packages/db/prisma/migrations/\*\_fraud_cases/migration.sql
- packages/domain/fraud/\*
- packages/domain/rewards/package.json
- packages/domain/rewards/src/scheduled-posting.service.ts
- packages/domain/rewards/src/scheduled-posting.service.test.ts
- packages/domain/events/src/ingestion.service.ts
- packages/domain/events/src/ingestion.service.test.ts
- apps/admin-api/src/fraud/\*
- apps/admin-web/src/api.ts
- apps/admin-web/src/App.tsx
- pnpm-lock.yaml

---

## Completion definition

Phase 9.2 is complete only when all of the following are true:

- risk signals persist in DB
- threshold crossing opens exactly one active case
- held pending rewards do not unlock
- allow releases holds atomically
- reject cancels held pending rewards atomically
- fraud queue/actions work in admin-api and admin-web
- targeted tests/builds pass
- live smoke verification succeeds
- changes are committed and pushed to origin/main
