# UPRM source audit and project evaluation

**Repository:** `BartSchuster22/AliceUPRM`
**Audited baseline:** `d010d868e120006491c2e60dabb46bc800208568` (`main`)
**Audit date:** 2026-07-19
**Authority order:** source code and tests → Prisma schema and migrations → runtime evidence → current contracts/runbooks → roadmap documents

## 1. Executive assessment

UPRM is a substantial, working multi-tenant reward platform, not a placeholder repository. The audited tree contains five applications, sixteen domain packages, one database package, one TypeScript client, 385 TypeScript source/test files, and 15 Prisma migration directories. A focused source-line inventory counted about 49,600 lines across 360 relevant TypeScript, SQL, Prisma, Markdown, YAML, JSON, and shell files, excluding dependencies and generated coverage.

The project implements the hard parts of a reward platform: idempotent event ingestion, transactional outbox publication, HMAC tenant authentication, referral ancestry, balanced double-entry postings, reward holds and reversals, wallet grants/redemptions, checkout credit reservation, Stripe webhook normalization, settlements, payouts, fraud cases, outbound webhooks, promoter qualification, and reporting rollups.

It is **operationally usable and test-backed**, but it is not equivalent to every future-state promise in `UPRM_Implementation_Guide.md`. The strongest production concerns are tenant-admin authorization scope, credential-at-rest design, incomplete API/operations packaging, and infrastructure components that are provisioned but not yet integrated into application code.

### Audit verdict

| Area | Assessment |
| --- | --- |
| Domain implementation | Broad and coherent; core paths are implemented. |
| Data integrity | Strong ledger/idempotency foundations; 15 migrations are applied in the audited database. |
| Testability | Good unit/controller coverage; 244 tests passed across 61 Vitest files/Jest suites after repairs. |
| Build | All apps and packages now build from the root command. |
| Documentation | Previously fragmented and partly stale; current README and this evaluation establish an authority hierarchy. |
| Security | Sound primitives in several paths, but open high-priority authorization and secret-storage work remains. |
| Operations | Live services and database were healthy after RabbitMQ/worker recovery; deployment automation remains host-specific. |
| Roadmap completion | Core reward platform complete; enterprise/public-product features remain partial or absent. |

## 2. Audit method and evidence

The evaluation directly inspected:

- every workspace package manifest and the root scripts;
- controllers and route decorators in all applications;
- the Prisma schema and all migration directories;
- representative and security-critical services for tenancy, HMAC, ledger, wallet, payments, webhooks, auth, fraud, reporting, and workers;
- the complete Jest/Vitest test run, TypeScript checks, build, lint behavior, and migration status;
- Docker Compose infrastructure and systemd service state;
- the implementation guide, historical as-built document, integration baseline, testing guide, plans, and runbooks;
- the local Git branch and remote baseline for the private GitHub repository.

`UPRM_As_Built.md` predates later wallet, promoter, webhook, reporting, checkout-reservation, and operational work. It is retained as historical context, not used as proof of current behavior. `UPRM_Implementation_Guide.md` is a target architecture and roadmap; its future-state statements are not assumed implemented.

## 3. Complete project architecture

### 3.1 Applications

| Application | Implemented behavior | Status |
| --- | --- | --- |
| `api-core` | NestJS tenant API, global DTO validation, exact raw-body capture, HMAC guard, users, referrals, events, promoter applications, products, billing/checkout. Binds to loopback. | Implemented and deployed. |
| `admin-api` | NestJS admin API, local login/JWT verification, RBAC, bootstrap provisioning, tenants, users, promoters, fraud, settlement, payouts, webhooks, reporting; serves built admin SPA. | Implemented and deployed. |
| `worker` | Standalone Node process (not Nest bootstrap) connecting to RabbitMQ; outbox relay, reward consumer, scheduled postings, webhook dispatcher, reporting rollups, promoter qualification, health and Prometheus metrics. | Implemented and deployed. |
| `admin-web` | React/Vite operator console for dashboards, tenant navigation, users, promoters, rewards, referrals, fraud, settlements, payouts, webhook deliveries, and configuration. | Implemented; served by admin API build. |
| `scheduler` | Generated NestJS shell with hello-world controller/test. Real periodic processing is in `worker`. | Placeholder/obsolete path; not a deployed business component. |

### 3.2 Domain packages

| Package | Code responsibility | Evaluation |
| --- | --- | --- |
| `tenants` | Tenant creation/configuration, API-key issue/revoke, HMAC verification, checkout catalog. | Core implemented. |
| `identity` | Global users and tenant-user resolution/provenance. | Core implemented. |
| `events` | Validated, idempotent event ingestion and outbox creation. | Core implemented. |
| `referrals` | Code lifecycle, edge creation, ancestry, referral summaries. | Core implemented. |
| `ledger` | Account lifecycle and atomic balanced postings. | Core implemented; strongest invariant boundary. |
| `rewards` | Config parsing, rule evaluation, caps, holds, scheduling, reversal handling. | Broadly implemented. |
| `wallet` | Legacy balances plus v2 grants, reservations, redemption, payout allocation, release. | Implemented behind compatibility/feature-flag paths. |
| `payments` | Stripe checkout/webhook normalization and tenant clearing operations. | Implemented for Stripe; not a provider abstraction. |
| `settlements` | Settlement cycle open/close and liabilities. | Implemented baseline. |
| `payouts` | Request and lifecycle state transitions. | Workflow implemented; no full external payout-provider adapter found. |
| `fraud` | Config parsing, signals, case opening, review actions, reward holds. | Implemented baseline rule/case engine. |
| `promoter` | Applications, profiles, daily metrics, automatic/manual qualification. | Implemented. |
| `outbox` | Transactional outbox polling and RabbitMQ publisher. | Implemented. |
| `webhooks` | Subscription config, signed delivery, claims/retries/dead letters/replay. | Implemented. |
| `reporting` | Daily cohort, conversion, reward performance, tenant liability rollups and overview. | Implemented; repaired dependency injection/default-client regression. |
| `db` | Prisma client, schema, and migrations. | Implemented; schema current in audited database. |
| `uprm-client` | Canonical request signing and tenant API calls. | Implemented. |

### 3.3 Infrastructure

`infra/docker/docker-compose.yml` provisions:

- PostgreSQL 16;
- Redis 7;
- RabbitMQ 3 with management UI;
- MinIO;
- Prometheus;
- Loki;
- Grafana.

PostgreSQL and RabbitMQ are active dependencies. Redis and MinIO are provisioned but no material application client integration was found in the audited TypeScript source; they are expansion infrastructure, not current core dependencies. Prometheus scrapes worker/application metrics; metrics are manually emitted rather than supplied through a full instrumentation framework. Loki/Grafana provide host-local observability. There is no Kubernetes, Helm, Terraform, or cloud deployment module in this repository.

## 4. HTTP API surface

The controller inventory contains 21 controllers and 60 decorated routes. The worker's actual standalone runtime adds `/healthz` and `/metrics`; its generated `AppController` route is not bootstrapped.

### 4.1 Tenant-facing routes

| Method | Route |
| --- | --- |
| `POST` | `/v1/events` |
| `POST` | `/v1/users` |
| `GET` | `/v1/users/external/:externalUserId/profile` |
| `GET` | `/v1/users/external/:externalUserId/subscriptions` |
| `GET` | `/v1/users/:id` |
| `GET` | `/v1/users/:id/balance` |
| `GET` | `/v1/users/:id/promoter-status` |
| `POST` | `/v1/users/:id/payouts` |
| `GET` | `/v1/users/:id/payouts` |
| `GET` | `/v1/users/:id/referral-tree` |
| `POST` | `/v1/promoter-applications` |
| `POST` | `/v1/products/register` |
| `POST` | `/v1/referrals/codes` |
| `GET` | `/v1/referrals/codes/:code` |
| `POST` | `/v1/referrals/apply` |
| `GET` | `/v1/referrals/users/:externalUserId/summary` |
| `POST` | `/v1/billing/checkout-sessions` |
| `POST` | `/v1/billing/checkout-sessions/release` |

All business routes are protected by the HMAC guard at module/controller level. The client and server canonicalize timestamp, uppercase method, request URL, and SHA-256 body digest. The server accepts five minutes of clock skew and compares signatures with `timingSafeEqual`.

### 4.2 Administrative routes

| Method | Route |
| --- | --- |
| `POST` | `/auth/login` |
| `POST` | `/bootstrap/admin-users` |
| `POST` | `/bootstrap/admin-users/local` |
| `POST` | `/admin/tenants` |
| `GET` | `/admin/tenants` |
| `GET` | `/admin/tenants/:id` |
| `POST` | `/admin/tenants/:id/config` |
| `POST` | `/admin/tenants/:id/webhook-config` |
| `GET` | `/admin/users` |
| `GET` | `/admin/users/:tenantUserId` |
| `GET` | `/admin/users/:tenantUserId/ledger` |
| `GET` | `/admin/users/:tenantUserId/referral-tree` |
| `POST` | `/admin/users/:tenantUserId/manual-adjustments` |
| `GET` | `/admin/promoter-applications` |
| `POST` | `/admin/promoter-applications/manual-create` |
| `POST` | `/admin/promoter-applications/:id/approve` |
| `POST` | `/admin/promoter-applications/:id/reject` |
| `GET` | `/admin/promoter-applications/:id` |
| `GET` | `/admin/promoter-applications/:id/performance` |
| `GET` | `/admin/fraud-cases` |
| `GET` | `/admin/fraud-cases/:id` |
| `POST` | `/admin/fraud-cases/:id/allow` |
| `POST` | `/admin/fraud-cases/:id/reject` |
| `POST` | `/admin/fraud-cases/:id/escalate` |
| `GET` | `/admin/settlement-cycles` |
| `GET` | `/admin/settlement-cycles/:id` |
| `POST` | `/admin/settlement-cycles/open` |
| `POST` | `/admin/settlement-cycles/:id/close` |
| `GET` | `/admin/payouts/:id` |
| `POST` | `/admin/payouts/:id/approve` |
| `POST` | `/admin/payouts/:id/send` |
| `POST` | `/admin/payouts/:id/fail` |
| `POST` | `/admin/payouts/:id/cancel` |
| `GET` | `/admin/webhook-deliveries` |
| `GET` | `/admin/webhook-deliveries/:id` |
| `POST` | `/admin/webhook-deliveries/:id/replay` |
| `POST` | `/admin/webhooks/stripe/:tenantId` |
| `GET` | `/admin/reports/overview` |

The admin API verifies JWTs against a configured shared secret or public key, re-resolves the subject in `admin_users`, checks active status, and applies role guards. Local passwords use scrypt with a random salt and timing-safe comparison.

No generated OpenAPI/Swagger contract is currently exposed. DTOs, controllers, tests, and `docs/integration/phase-10-contract-baseline.md` are the effective contract.

## 5. Database and invariants

The schema contains 41 application tables. Major groups are:

- **tenancy/auth:** `tenants`, `tenant_configs`, `tenant_api_keys`, `users`, `tenant_users`, `admin_users`, `audit_logs`;
- **events/outbox:** `ingested_events`, `event_links`, `outbox_messages`;
- **referrals/promoters:** `referral_codes`, `referral_edges`, `referral_ancestry`, `promoter_profiles`, `promoter_applications`, `promoter_application_links`, `promoter_metrics_daily`;
- **ledger/rewards:** `ledger_accounts`, `ledger_entries`, `ledger_postings`, `reward_holds`, `scheduled_postings`;
- **wallet:** `wallet_accounts`, `wallet_grants`, `wallet_redemptions`, `wallet_redemption_allocations`, `wallet_payout_reservations`, `wallet_payout_allocations`;
- **payments/settlement:** `tenant_clearing_entries`, `fx_quotes`, `settlement_cycles`, `payout_requests`;
- **fraud:** `risk_signals`, `risk_cases`, `risk_case_events`;
- **webhooks:** `webhook_deliveries`;
- **reporting:** `cohort_retention_daily`, `conversion_daily`, `reward_performance_daily`, `tenant_liability_daily`.

Verified integrity mechanisms include:

1. tenant-scoped uniqueness/idempotency constraints;
2. atomic event plus outbox creation;
3. zero-sum ledger validation using `bigint` minor units;
4. account tenant, currency, and active-status checks;
5. transactional entry/posting creation;
6. duplicate-key race recovery for ledger and event ingestion;
7. stateful claims for scheduled postings and webhook deliveries;
8. explicit terminal/dead-letter states;
9. immutable event/audit records for critical operator actions.

The audited live database reported 15 migrations and `Database schema is up to date`.

## 6. Main processing flows

### Event to reward

1. A tenant signs and posts `/v1/events`.
2. HMAC auth resolves a tenant/API key.
3. Event ingestion validates tenant context and idempotency.
4. The event and outbox message are persisted transactionally.
5. The worker publishes the outbox record to RabbitMQ.
6. The reward consumer loads tenant rules/referral ancestry.
7. Reward logic posts immediately, schedules a posting, or creates a hold/risk path.
8. Ledger posting enforces balanced, tenant-scoped atomic entries.
9. Reporting and webhook projections are updated asynchronously.

### Checkout credit and Stripe

1. The tenant registers checkout products and requests a session.
2. Wallet credit may be reserved against eligible grants.
3. Stripe checkout metadata links the reservation/redemption.
4. The tenant-specific Stripe endpoint validates the exact raw body with its webhook secret.
5. Supported Stripe events normalize into UPRM events.
6. Completion posts wallet redemption; expiration releases reservation.
7. Runbooks cover expiration reconciliation and phased wallet behavior.

### Outbound webhooks

1. A domain event resolves enabled tenant endpoints/event types.
2. A delivery record snapshots URL, signing secret, and payload.
3. The worker claims due rows, signs callbacks, and attempts delivery.
4. Failures are retried with scheduling and terminal dead-letter state.
5. Admins can inspect/replay deliveries; API/audit responses now exclude signing secrets.

## 7. Verification results

After correcting the reporting dependency regression and stale-distribution test discovery:

| Command/check | Result |
| --- | --- |
| `pnpm test` | Passed: 244 tests (158 Vitest + 86 Jest), 61 test files/suites. |
| `pnpm typecheck` | Passed across all packages defining `typecheck`. |
| `pnpm build` | Passed after the root build selector was corrected to compile all 22 workspace projects. |
| reporting focused test | Passed: 5/5. |
| settlement focused test | Passed: 2/2 after excluding compiled `dist` tests. |
| tenant secret-redaction test | Passed: 5/5. |
| Prisma migration status | 15 migrations; database up to date. |
| public endpoint | HTTPS returned HTTP 200 during the audit. |
| service health | API core/admin active; worker `/healthz` restored to `ok`; RabbitMQ running/unpaused. |

`pnpm lint` initially exposed 79 worker problems after making lint non-mutating. These were largely type-safety debt around `any`-based Prisma/test seams plus promise/error handling. This command is being treated as a real quality gate rather than silently modifying source; remaining status must be verified in the final change record.

## 8. Source vs. documentation and roadmap

| Design/roadmap capability | Source-backed status | Notes |
| --- | --- | --- |
| Multi-tenant API and configuration | Implemented | Tenant IDs are pervasive in schema/services. Admin tenant scoping remains incomplete. |
| HMAC tenant API | Implemented | Five-minute skew, canonical body digest, timing-safe comparison. Key-at-rest design needs hardening. |
| Global and tenant user identity | Implemented | Provenance/entity fields extend the early design. |
| Referral graph and multilevel rewards | Implemented | Ancestry, tiers, caps, holds, reversals, scheduling covered. |
| Immutable double-entry ledger | Implemented | Strong atomic/idempotent checks. |
| Wallet | Implemented in phases | Legacy and v2 grant/reservation/redemption paths coexist; feature flag controls reads. |
| Stripe billing/webhooks | Implemented | Tenant webhook configuration and checkout lifecycle exist. |
| Generic payment-provider abstraction | Not implemented | Stripe is the concrete provider. |
| Settlements and payouts | Partial-to-implemented | Internal workflow/state machine exists; external payout execution is not complete. |
| Fraud/risk engine | Implemented baseline | Rules/signals/cases/holds; not an external ML scoring platform. |
| Promoter lifecycle | Implemented | Application review, metrics, auto/manual qualification. |
| Outbound tenant webhooks | Implemented | Signing, retries, dead-letter, replay. |
| Reporting/dashboard | Implemented baseline | Daily read models and overview dashboard; not a general BI warehouse. |
| Redis caching/rate limiting | Not implemented in app code | Redis is only provisioned. |
| MinIO exports/documents | Not implemented in app code | MinIO is only provisioned. |
| OpenAPI/public SDK ecosystem | Partial | TS client exists; no generated OpenAPI or multi-language SDKs. |
| Kubernetes/IaC/autoscaling | Not present | Current deployment is systemd + Docker Compose. |
| SLOs/tracing/alerts | Partial | Health and Prometheus metrics exist; no full distributed tracing/alert package. |
| CI/CD | Added as repository quality checks | Deployment remains intentionally separate and host-specific. |

## 9. Security and correctness findings

### Corrected in this completion

1. **Admin API and audit-log secret exposure.** Tenant list/detail and webhook-config update responses could include Stripe/outbound secrets because tenant records/config were returned directly. Tenant creation audit rows could also store the one-time plaintext API key, and webhook replay audit rows could store signing secrets. Source now recursively redacts known sensitive config fields from responses/audits and maps replay audit data to a safe projection. Existing audited rows were scrubbed (17 tenant-related rows and one replay row); verification found all 17 remaining sensitive key names paired with `[REDACTED]` and zero replay rows containing signing-secret fields.
2. **Reporting dependency regression.** The reporting service's default/injected database behavior failed the repository test. Constructor/default handling and its regression assertion were corrected.
3. **Tests after build.** Compiled `dist/*.test.js` caused settlement tests to execute CommonJS Vitest output. A package Vitest config now excludes build output.
4. **Incomplete root build.** The former root filter only built top-level packages and omitted nested domain packages. `pnpm build` now runs every workspace build script.
5. **Mutating lint command.** App `lint` commands previously used `--fix`. CI lint is now read-only; explicit `lint:fix` scripts retain the opt-in repair mode.
6. **Worker false health.** RabbitMQ was paused and persisted users no longer matched `.env`; systemd still reported the blocked worker as active and port 4002 was absent. The broker was unpaused, the configured user was restored with vhost permissions, the worker restarted, and `/healthz`/metrics were verified.

### Open high-priority work

1. **Tenant-admin/support authorization is role-only, not tenant-scoped.** `AdminUser` has roles but no tenant membership/scope. Several controllers allow `tenant_admin` or `support` to list or request arbitrary tenant IDs. In a true multi-customer control plane, this permits cross-tenant administration/data access. Add admin-to-tenant assignments and enforce them in a policy guard/service on every query and resource lookup.
2. **The stored HMAC key hash is itself the signing key.** API-key issuance stores `SHA-256(plaintextKey)`, and verification uses that hash as the HMAC key. This prevents recovery of the original plaintext, but a database read grants a directly usable signing secret. Replace this with encrypted-at-rest HMAC material (KMS/envelope encryption) or an asymmetric request-signing design; rotate existing keys during migration.
3. **Webhook and Stripe secrets are plaintext in tenant JSON/delivery rows.** API/log exposure was corrected, but database readers can still recover them. Encrypt secret fields at rest and avoid copying long-lived secrets into each delivery row; store a key reference/version instead.
4. **Existing API keys should be reviewed/rotated.** Two historical tenant-creation audit rows contained plaintext keys before scrubbing. Removing the logs limits future exposure but cannot prove the values were never read.
5. **No API rate limiting/replay nonce store.** HMAC timestamps limit replay to five minutes, but identical signed requests may be replayed during that window; business idempotency covers many writes, not all abuse. Add nonce/request-ID storage and per-tenant throttling (Redis is available).
6. **Bootstrap token comparison is ordinary string equality.** Use a timing-safe digest comparison and operationally disable/unset the bootstrap token after provisioning.
7. **Outbound webhook URL policy is unrestricted.** Privileged configuration can target arbitrary URLs. Add scheme validation plus private/link-local/metadata-address controls if tenant admins are not fully trusted.

## 10. Reliability and maintainability findings

- Worker readiness occurs only after RabbitMQ startup, but systemd `active` alone can be misleading while startup is blocked. Configure a startup timeout/readiness watchdog and alert on absent port/health.
- The worker does not reconnect indefinitely after a broker authentication/configuration error; systemd restarts it. That is acceptable only with bounded backoff and alerting.
- Reporting and promoter rollups scan every tenant on intervals in one process. Add per-tenant work partitioning/leases before high-scale deployment.
- Several source/test seams still use `any` and mutate private dependencies for mocking. Prefer constructor injection and narrow interfaces.
- `scheduler` is misleading dead scaffolding. Remove it or make its role explicit after confirming no external deployment depends on it.
- Domain tests are primarily mocked/unit tests. Add PostgreSQL/RabbitMQ integration tests for constraints, concurrent idempotency, migrations, outbox claims, and recovery.
- Docker images use moving `latest` tags for some infrastructure services. Pin tested versions/digests.
- The repository does not version systemd units or reverse-proxy configuration, so a clean host cannot be reproduced solely from GitHub. Add deployment templates/runbooks without committing secrets.

## 11. Recommended completion sequence

### P0 — before broader tenant/admin use

- Add tenant-scoped admin authorization and regression tests.
- Rotate affected API keys and move HMAC/webhook secrets to encrypted storage.
- Add nonce/rate-limit protection to HMAC endpoints.
- Keep CI test/typecheck/build/lint green on every pull request.

### P1 — production hardening

- Add real database/message-broker integration tests and migration rehearsal.
- Version systemd/reverse-proxy deployment templates and a rollback procedure.
- Pin infrastructure images and add RabbitMQ/worker readiness alerts.
- Add webhook egress policy and delivery secret references.
- Add OpenAPI generation and contract checks.

### P2 — roadmap/scale

- External payout provider adapter and reconciliation.
- Redis-backed caching, rate limiting, and replay nonce storage.
- Object-storage exports if MinIO remains required.
- Distributed tracing, SLOs, and alert rules.
- Partitioned/leased worker execution and horizontal scaling.
- Remove obsolete scheduler shell and historical documentation ambiguity.

## 12. Final project characterization

UPRM is best described as an **internal multi-tenant reward and partner accounting control plane**. Its codebase already contains a credible financial-domain core: balanced ledger postings, idempotent workflows, event/outbox processing, wallet reservations, reversals, fraud holds, settlement state, and auditable administration. The implementation is materially ahead of the old as-built document but narrower than the implementation guide's full enterprise vision.

The repository is now structured to explain that distinction: the README describes what operators and developers can actually run, this document records evidence and gaps, roadmap documents remain future-facing, and historical material is explicitly labeled.
