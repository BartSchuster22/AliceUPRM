# AliceUPRM

AliceUPRM is the source repository for **UPRM (Unified Partner & Reward Management)**: a private, multi-tenant rewards, referrals, promoter, wallet, settlement, payout, fraud, and reporting platform.

The system is a TypeScript/pnpm monorepo built around NestJS services, domain packages, PostgreSQL/Prisma, RabbitMQ, Redis, Stripe, and a React administration console.

> **Current status:** the core platform is implemented and tested, but this repository should be treated as a production-oriented internal platform rather than a finished public SaaS product. See [the source audit and project evaluation](docs/PROJECT_EVALUATION.md) for implemented capabilities, known limitations, security observations, and roadmap differences.

## What UPRM does

UPRM gives several tenant businesses one shared back end for:

- registering and resolving tenant users;
- creating and applying referral codes and maintaining referral ancestry;
- ingesting idempotent business events;
- evaluating direct, multi-level, hold, cap, and reversal-aware rewards;
- maintaining immutable, balanced, tenant-scoped ledger entries;
- exposing legacy and grant-based wallet balances and redemptions;
- accepting promoter applications and running automated qualification;
- handling checkout credit reservations and Stripe subscription webhooks;
- managing settlement cycles and payout state transitions;
- detecting fraud signals and managing auditable risk cases;
- signing and retrying outbound tenant webhooks;
- building daily reporting read models and serving the admin dashboard.

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/api-core` | Tenant-facing HMAC-authenticated HTTP API. |
| `apps/admin-api` | JWT/RBAC admin API, bootstrap endpoints, Stripe webhooks. |
| `apps/worker` | RabbitMQ consumer plus outbox, reward, webhook, reporting, promoter, and scheduler loops; health/metrics server. |
| `apps/admin-web` | React/Vite administration console. |
| `apps/scheduler` | Generated NestJS scheduler shell; not part of the deployed processing path. |
| `packages/db` | Prisma schema, client export, and 15 migration directories. |
| `packages/domain/*` | Domain modules for tenants, identity, events, referrals, ledger, rewards, wallet, payments, settlements, payouts, fraud, promoters, outbox, webhooks, and reporting. |
| `packages/clients/uprm-client` | TypeScript HMAC API client. |
| `infra/docker` | Local PostgreSQL, Redis, RabbitMQ, MinIO, Prometheus, Loki, and Grafana stack. |
| `infra/systemd` | Versioned infrastructure, API, and worker service units. |
| `infra/caddy` | Public HTTPS/reverse-proxy template. |
| `scripts` | Environment validation, system-file installation, and database backup/restore tooling. |
| `docs` | Contracts, runbooks, design notes, completion plans, and the current evaluation. |

## Runtime architecture

```text
Tenant systems
    |
    | UPRM-HMAC requests
    v
api-core (127.0.0.1:4000) ----+
                               |
Admin browser -> admin-api ----+----> PostgreSQL / Prisma
                 (:4001)       |          |
                    |          |          +--> transactional outbox
                    +-> Stripe |                    |
                        webhook|                    v
                               +--------------> RabbitMQ
                                                    |
                                                    v
                                             worker (:4002)
                                               | rewards
                                               | scheduled postings
                                               | webhook delivery
                                               | reporting rollups
                                               + promoter qualification

admin-web -> admin-api
Prometheus -> /metrics; Grafana/Loki provide local observability
```

The production-facing services are managed by versioned systemd units. Supporting infrastructure uses digest-pinned Docker Compose images. A versioned Caddy template reproduces public routing and automatic TLS.

## APIs

### Tenant API (`apps/api-core`)

All business routes use `UPRM-HMAC` authorization. Major route groups are:

| Prefix | Capability |
| --- | --- |
| `/v1/events` | Idempotent event ingestion. |
| `/v1/users` | User registration, profile, balance, subscription, promoter, payout, and referral-tree views. |
| `/v1/referrals` | Referral code creation, lookup, application, and summary. |
| `/v1/promoter-applications` | Tenant-side promoter application submission. |
| `/v1/products` | Tenant checkout product registration. |
| `/v1/billing` | Checkout session creation and credit-reservation release. |

Canonical request signing is:

```text
<unix timestamp>\n
<UPPERCASE HTTP method>\n
<request path including query>\n
<SHA-256 hex digest of the exact request body>
```

The authorization header is:

```text
UPRM-HMAC <8-hex key prefix>:<unix timestamp>:<64-hex HMAC>
```

Use `packages/clients/uprm-client` rather than reimplementing signing in integrations.

### Admin API (`apps/admin-api`)

| Prefix | Capability |
| --- | --- |
| `/auth` | Local admin login and JWT issuance. |
| `/bootstrap/admin-users` | Token-protected initial admin provisioning. |
| `/admin/tenants` | Tenant lifecycle and configuration. |
| `/admin/users` | User browser, ledger, referral tree, manual adjustments. |
| `/admin/promoter-applications` | Review, manual creation, and performance. |
| `/admin/fraud-cases` | Case review and allow/reject/escalate actions. |
| `/admin/settlement-cycles` | Open, inspect, and close settlement cycles. |
| `/admin/payouts` | Inspect and transition payouts. |
| `/admin/webhook-deliveries` | Inspect and replay outbound deliveries. |
| `/admin/webhooks/stripe/:tenantId` | Stripe webhook ingestion. |
| `/admin/reports/overview` | Dashboard aggregates and series. |

Admin routes use a JWT guard and role checks. The bootstrap routes use a separate bootstrap token and must not be exposed without that control.

### Worker endpoints

The standalone worker exposes only:

- `GET /healthz`
- `GET /metrics`

The generated Nest `AppController` under `apps/worker` is not used by `apps/worker/src/main.ts`.

## Data model

The Prisma schema contains 41 application tables plus Prisma migration metadata. The model is tenant-scoped and covers:

- tenants, tenant configuration, API keys, users, and admin users;
- ingested events and transactional outbox messages;
- referral codes, edges, ancestry, promoter profiles, applications, and metrics;
- ledger accounts, entries, postings, reward holds, and scheduled postings;
- wallet accounts, grants, redemptions, payout reservations, and allocations;
- checkout/tenant clearing, FX quotes, settlement cycles, and payout requests;
- fraud signals, risk cases, risk case events, and audit logs;
- outbound webhook delivery state;
- daily reporting rollups.

Money-like ledger amounts use integer minor units (`BigInt`), not floating point. Ledger posting validates tenant ownership, currency, account status, idempotency, and zero-sum balance before an atomic transaction.

See [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma) and [`docs/PROJECT_EVALUATION.md`](docs/PROJECT_EVALUATION.md).

## Local development

### Prerequisites

- Node.js 20
- pnpm 10.33
- Docker with Compose

### Setup

```bash
cp .env.example .env
# Populate every required secret. Never commit .env.

pnpm install --frozen-lockfile
pnpm --filter @uprm/db db:generate

docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm --filter @uprm/db db:migrate:deploy
```

Start services in separate terminals:

```bash
PORT=4000 pnpm --filter api-core start:dev
PORT=4001 pnpm --filter admin-api start:dev
PORT=4002 pnpm --filter worker start:dev
pnpm --filter admin-web dev
```

### Quality gates

```bash
pnpm lint       # read-only check
pnpm typecheck
pnpm test
pnpm build      # builds every app and package that defines build
```

The test suite uses Jest and Vitest. Database-heavy domain tests use fakes/mocks; migration status must be checked separately against the target database.

## Deployment and operations

Read these before operating a deployed environment:

- [Clean-server installation](docs/deployment/INSTALL.md)
- [Stateful server migration](docs/deployment/MIGRATION.md)
- [Migration rollback](docs/deployment/ROLLBACK.md)
- [Former-server decommission gates](docs/deployment/DECOMMISSION.md)
- [Reproducibility implementation plan](docs/plans/2026-07-19-reproducible-install-migration-plan.md)
- [`TESTING.md`](TESTING.md)
- [`RUNBOOK_CHECKOUT_CREDIT_RESERVATIONS.md`](RUNBOOK_CHECKOUT_CREDIT_RESERVATIONS.md)
- [`RUNBOOK_GLOBAL_WALLET_PHASE1.md`](RUNBOOK_GLOBAL_WALLET_PHASE1.md)
- [`RUNBOOK_GLOBAL_WALLET_PHASE2.md`](RUNBOOK_GLOBAL_WALLET_PHASE2.md)
- [`docs/PROJECT_EVALUATION.md`](docs/PROJECT_EVALUATION.md)

Operational invariants:

1. Run `prisma migrate deploy` before starting code that depends on a new schema.
2. Keep RabbitMQ running and verify `http://127.0.0.1:4002/healthz`; a systemd `active` state alone does not prove worker readiness.
3. Verify `/metrics` counters after deployment.
4. Back up PostgreSQL before migrations and destructive operations.
5. Rotate API, JWT, Stripe, RabbitMQ, Redis, database, and bootstrap secrets outside source control.


### Reproducible install/migration tooling

The deployment toolchain is intentionally split into read-only checks and explicit mutating phases:

| Script | Purpose | Mutates host/data by default? |
| --- | --- | --- |
| `scripts/preflight-host.sh` | Read-only OS, capacity, command, repo, and optional DNS preflight. | No |
| `scripts/bootstrap-host.sh` | Creates the `uprm` user/directories and installs base OS packages only with `--apply`. | Dry-run by default |
| `scripts/validate-env.sh` | Validates example/production environment files without printing values. | No |
| `scripts/backup-postgres.sh` / `scripts/restore-postgres.sh` | Deterministic PostgreSQL backup/restore with checksums and restore confirmation. | Backup no; restore requires confirmation |
| `scripts/backup-rabbitmq-definitions.sh` / `scripts/restore-rabbitmq-definitions.sh` | Export/import RabbitMQ definitions with checksum verification. | Backup no; import requires confirmation |
| `scripts/check-drain-state.sh` | Read-only cutover gate for outbox/scheduled/webhook/queue backlog. | No |
| `scripts/create-migration-bundle.sh` / `scripts/verify-migration-bundle.sh` | Build/verify encrypted migration bundles containing external private artifacts. | No live mutation |
| `scripts/install-system-files.sh` | Validates and installs systemd/Caddy templates only with `--apply`. | Dry-run by default |
| `scripts/install-uprm.sh` | Phased install orchestrator: `check`, `prepare`, `migrate`, `build`, `install-services`, `verify`, `all`. | Phase-dependent |
| `scripts/verify-installation.sh` | Read-only acceptance verifier for target installs/migrations. | No |

## Documentation authority

Documentation has different roles:

- **Source, schema, migrations, and tests** are the implementation authority.
- [`docs/PROJECT_EVALUATION.md`](docs/PROJECT_EVALUATION.md) is the current as-audited description.
- [`UPRM_Implementation_Guide.md`](UPRM_Implementation_Guide.md) is a design and roadmap document; it intentionally includes future-state capabilities.
- [`UPRM_As_Built.md`](UPRM_As_Built.md) is a historical 2026-04 snapshot and is not current.

## License and use

Workspace packages are marked `private`/`UNLICENSED`. No open-source license is granted by this repository.
