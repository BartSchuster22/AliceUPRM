# Phase 9.3 Reporting & Analytics Implementation Plan

> For Hermes: execute this plan with strict TDD. Write the failing tests first, watch them fail, then implement the minimum code to pass.

Goal: add daily reporting read models and admin dashboards for conversion, reward ROI, tenant liability, and cohort retention.

Architecture: add four projection tables to Prisma, create a new `@uprm/reporting` package that rebuilds/rolls up daily analytics from canonical source tables, expose read-only admin endpoints in `admin-api`, and render a new Reports view in `admin-web` using pre-aggregated API responses. Run rollups from the existing worker loop so production gets continuous analytics refresh without inventing a new runtime.

Tech stack: Prisma, TypeScript, Vitest for domain package tests, Jest for Nest controllers/worker tests, React + Vite + Recharts for admin charts.

---

## Data mapping decisions

Roadmap truth: Phase 9.3 requires `conversion_daily`, `reward_performance_daily`, `tenant_liability_daily`, `cohort_retention_daily`.

Live implementation truth in `/srv/uprm`:

- conversions come from `ingested_events`
- reward issuance/posting comes from `scheduled_postings` and `ledger_entries`
- tenant liability comes from `ledger_accounts`/`ledger_postings` using `accountType = 'user_balance'`
- retention should be computed from paid-event activity by signup cohort because no separate subscription read model exists yet

Projection rules:

- `conversion_daily`
  - grain: `(tenantId, day, eventType)`
  - store total events, distinct external users, distinct tenant users
- `reward_performance_daily`
  - grain: `(tenantId, day, currency)`
  - store reward entries count, reward expense minor total, distinct beneficiary users, posted scheduled count
  - treat reward ledger entries as rows where description starts with `L` and contains `referral reward`
- `tenant_liability_daily`
  - grain: `(tenantId, day, currency)`
  - store raw user-balance liability and display liability as the negated raw sum
- `cohort_retention_daily`
  - grain: `(tenantId, cohortDay, activityDay)`
  - cohort source: `tenant_users.joinedAt`
  - active-retained source: users with at least one paid conversion event on `activityDay`

## Task 1: Add failing schema-aware tests for reporting rollups

Objective: define the expected rollup behavior before implementation.

Files:

- Create: `packages/domain/reporting/src/reporting.service.test.ts`
- Create: `packages/domain/reporting/src/index.ts`
- Create: `packages/domain/reporting/package.json`
- Create: `packages/domain/reporting/tsconfig.json`
- Create: `packages/domain/reporting/vitest.config.ts`

Steps:

1. Write Vitest tests for:
   - `rebuildConversionDaily` aggregates event counts by tenant/day/event type
   - `rebuildRewardPerformanceDaily` aggregates reward counts/amounts from ledger reward entries and posted scheduled rows
   - `rebuildTenantLiabilityDaily` stores both raw and display liability correctly
   - `rebuildCohortRetentionDaily` computes cohort size and retained paid users by cohort/activity day
   - `getDashboardSeries` returns a bounded date range and zero-safe series ordering
2. Run `pnpm --filter @uprm/reporting test` and verify failure because the package does not exist yet.

## Task 2: Add Prisma projection tables and migration

Objective: persist reporting read models in the database.

Files:

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_reporting_read_models/migration.sql`

Tables:

- `conversion_daily`
- `reward_performance_daily`
- `tenant_liability_daily`
- `cohort_retention_daily`

Required fields:

- all tables: `id`, `tenantId`, day fields, `createdAt`, `updatedAt`
- uniqueness by natural reporting grain
- indexes for `tenantId` + date access patterns

## Task 3: Implement reporting service to rebuild and read projections

Objective: create the projection logic in one place.

Files:

- Create: `packages/domain/reporting/src/reporting.service.ts`
- Modify: `packages/domain/reporting/src/index.ts`

Service API:

- `rebuildConversionDaily({ tenantId, from?, to? })`
- `rebuildRewardPerformanceDaily({ tenantId, from?, to? })`
- `rebuildTenantLiabilityDaily({ tenantId, from?, to? })`
- `rebuildCohortRetentionDaily({ tenantId, from?, to? })`
- `rebuildAll({ tenantId, from?, to? })`
- `getDashboardSeries({ tenantId, days })`

Implementation rules:

- projection only; never mutate source financial rows
- use delete-and-rebuild inside the requested date window for determinism
- normalize all dates to UTC calendar days
- return stringified bigint values at API boundary only, not inside the package internals

## Task 4: Add admin API tests and controller/service for reports

Objective: expose reporting data to the admin dashboard.

Files:

- Create: `apps/admin-api/src/reporting/reporting.controller.ts`
- Create: `apps/admin-api/src/reporting/reporting.module.ts`
- Create: `apps/admin-api/src/reporting/reporting.controller.spec.ts`
- Create: `apps/admin-api/src/reporting/dto/reporting-query.dto.ts`
- Modify: `apps/admin-api/src/app.module.ts`
- Modify: `apps/admin-api/package.json`

Endpoints:

- `GET /admin/reports/overview?tenantId=<id>&days=<n>`
- optional immediate refresh flag via query or separate POST is not required for MVP; read endpoints are enough if worker refresh is active

Response shape:

- `tenant_id`
- `range_days`
- `conversion_daily`
- `reward_performance_daily`
- `tenant_liability_daily`
- `cohort_retention_daily`

## Task 5: Add worker tests and analytics refresh loop

Objective: keep reporting projections updated live.

Files:

- Create: `apps/worker/src/reporting/reporting-rollup.spec.ts`
- Create: `apps/worker/src/reporting/reporting-rollup.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/package.json`

Behavior:

- periodic loop (for example every 15 minutes)
- for now rebuild all projections for all tenants over a bounded recent window (90 days) to keep logic simple and deterministic
- metrics:
  - `uprm_reporting_rollups_total`
  - `uprm_reporting_rollup_failures_total`
  - `uprm_reporting_last_success_unixtime`

## Task 6: Add admin-web API types, reports view, and charts

Objective: render the new reporting dashboard.

Files:

- Modify: `apps/admin-web/src/api.ts`
- Modify: `apps/admin-web/src/App.tsx`
- Modify: `apps/admin-web/package.json`

UI requirements:

- new nav item: `Reports`
- tenant-scoped report load
- line/bar charts for conversions, reward totals, liabilities, cohort retention
- preserve the current single-file `App.tsx` style rather than introducing a new frontend architecture mid-phase

## Task 7: Verify locally

Objective: prove the phase before touching live deployment.

Commands:

- `PNPM=/home/herman/.hermes/node/lib/node_modules/corepack/shims/pnpm`
- `"$PNPM" install --no-frozen-lockfile`
- `"$PNPM" --filter @uprm/db exec prisma generate`
- `"$PNPM" --filter @uprm/reporting run test`
- `"$PNPM" --filter @uprm/reporting run build`
- `"$PNPM" --filter admin-api test -- reporting.controller.spec.ts`
- `"$PNPM" --filter admin-api run build`
- `"$PNPM" --filter worker test -- reporting-rollup.spec.ts`
- `"$PNPM" --filter worker run build`
- `"$PNPM" --filter admin-web run build`

## Task 8: Deploy and live-verify

Objective: verify end to end on the VPS.

Deploy sequence:

1. apply migration
2. build `@uprm/reporting`
3. build consuming apps (`admin-api`, `worker`, `admin-web`)
4. restart `uprm-worker` and `uprm-admin-api`
5. verify worker metrics and admin reports endpoint
6. verify public admin page still serves 200

Live verification targets:

- admin reports endpoint returns all four series for PSI tenant
- worker metrics include reporting counters
- liability series reflects the live raw user-balance sum currently visible in Postgres
- charts render in the admin dashboard

## Task 9: Close the phase

Objective: finish the operational lifecycle.

Steps:

1. update shared memory vault with the completed Phase 9.3 checkpoint
2. commit validated changes
3. push to `origin/main`
4. verify local and remote HEAD match

Success criteria:

- YES: the four read-model tables exist and are populated
- YES: admin reporting endpoint returns pre-aggregated series
- YES: admin dashboard renders reporting charts
- YES: worker keeps projections refreshed and exposes reporting metrics
- YES: live deployment is verified and committed/pushed
