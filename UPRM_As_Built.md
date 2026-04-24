# UPRM — As-Built Documentation

Scope: what actually exists on the VPS and in `/srv/uprm` after Phase 6 payouts.
This is not an aspirational plan. It is the verified current state as of 2026-04-24 11:20:11 UTC.

---

## 1. System overview

UPRM is a standalone multi-tenant backend for identity, referrals, event ingestion, double-entry ledger accounting, reward scheduling/reversals, and payout request management. Its first tenant is PSI. It is exposed publicly at `https://uprm.aquiero.com`.

### 1.1 Host and access

- Hoster: Hetzner
- Public IP: `188.245.221.1`
- OS: Ubuntu 22.04.5 LTS
- Hostname: `ElioHermes1`
- Main service user: `uprm`
- Public domain: `uprm.aquiero.com`
- TLS: Let's Encrypt via Caddy
- Firewall posture: public ingress limited to 22/80/443

### 1.2 Pinned runtime/tooling

| Component  | Version |
| ---------- | ------- |
| Node.js    | 20.20.2 |
| pnpm       | 10.33.0 |
| TypeScript | 5.9.3   |
| NestJS     | 11.0.21 |
| Prisma     | 6.19.3  |
| Caddy      | 2.11.2  |
| RabbitMQ   | 3.13.7  |
| Postgres   | 16.13   |

Note: the ambient shell for other users may show a different Node version, but the UPRM runtime and build environment under user `uprm` is pinned to Node 20.20.2 via nvm.

---

## 2. Running services

### 2.1 systemd services

Verified active/running:

| Unit             | Port | Purpose                                    |
| ---------------- | ---- | ------------------------------------------ |
| `uprm-api-core`  | 4000 | Tenant-facing HMAC API                     |
| `uprm-admin-api` | 4001 | Bootstrap-token admin API                  |
| `uprm-worker`    | 4002 | Outbox relay + reward consumer + scheduler |

Verified properties:

- all three run as `uprm`
- all read secrets from `/srv/uprm/.env`
- all use `pnpm run start` from the Node 20.20.2 nvm path
- all restart automatically on failure
- all are enabled on boot
- ports 4000, 4001, and 4002 are listening on `127.0.0.1`

### 2.2 Docker support services

Verified running:

| Service             | Port(s)     | Purpose                               |
| ------------------- | ----------- | ------------------------------------- |
| `uprm-postgres-1`   | 5432        | primary DB                            |
| `uprm-rabbitmq-1`   | 5672, 15672 | broker + UI                           |
| `uprm-redis-1`      | 6379        | cache/locks, currently largely unused |
| `uprm-minio-1`      | 9000, 9001  | object storage, currently unused      |
| `uprm-prometheus-1` | 9090        | metrics scrape                        |
| `uprm-grafana-1`    | 3001        | dashboards                            |
| `uprm-loki-1`       | 3100        | log aggregation                       |

All are bound to loopback only.

### 2.3 Reverse proxy

Caddy routes:

- `/v1/*` -> `127.0.0.1:4000`
- everything else -> `127.0.0.1:4001`

Public HTTPS was verified live during this session.

---

## 3. Repository layout

Root: `/srv/uprm`

Current workspace packages/apps verified:

```text
apps/
  api-core
  admin-api
  worker
  scheduler   (scaffold only, not part of live runtime)
packages/
  db
  domain/
    events
    identity
    ledger
    outbox
    payouts
    referrals
    rewards
    tenants
```

Important note: the codebase is now ahead of the earlier Phase 0-5 snapshot because `@uprm/payouts` now exists and is live.

Git state at verification time:

- branch: `main`
- working tree: clean
- latest commit: `8915608 feat: add payout request and admin payout flow`

GitHub remote:

- private repo: `BartSchuster22/AliceUPRM`

---

## 4. Database

Postgres database: `uprm`
User: `uprm`

Verified public table count: 17

### 4.1 Table inventory

| Table                | Purpose                               |
| -------------------- | ------------------------------------- |
| `_prisma_migrations` | Prisma bookkeeping                    |
| `tenants`            | tenant directory                      |
| `tenant_api_keys`    | hashed API keys                       |
| `tenant_configs`     | tenant configs including reward rules |
| `users`              | global user identity                  |
| `tenant_users`       | per-tenant user mapping               |
| `referral_codes`     | active referral codes                 |
| `referral_edges`     | direct referral edges                 |
| `referral_ancestry`  | materialized closure table            |
| `ingested_events`    | immutable incoming tenant events      |
| `outbox_messages`    | transactional outbox                  |
| `event_links`        | event relationships                   |
| `ledger_accounts`    | chart of accounts                     |
| `ledger_entries`     | immutable financial events            |
| `ledger_postings`    | entry postings                        |
| `scheduled_postings` | deferred reward postings              |
| `payout_requests`    | payout lifecycle rows                 |

### 4.2 Ledger invariants

Still enforced by DB triggers in `packages/db/prisma/migrations/add_ledger_constraints.sql`:

- balanced entries required
- posting currency must match both entry and account currency

Important current caveat:

- the balanced-entry trigger still uses the `createdAt >= now() - interval '1 second'` heuristic and has not yet been hardened beyond that.

### 4.3 Live seed/business data known present

- PSI tenant exists
- Alice and Bob PSI tenant-users exist
- Alice -> Bob referral exists
- reward config exists for PSI
- `payout_requests` table exists and was verified to have `0` rows at inspection time

---

## 5. API surface

### 5.1 Tenant API (`api-core`, port 4000)

All protected by `HmacAuthGuard`.
Authorization header format:
`UPRM-HMAC <keyPrefix>:<unixTsSec>:<hexSignature>`

Current verified tenant endpoints:

| Method | Path                                  | Purpose                                                |
| ------ | ------------------------------------- | ------------------------------------------------------ |
| POST   | `/v1/users`                           | create or fetch tenant user                            |
| GET    | `/v1/users/:id`                       | fetch tenant user                                      |
| GET    | `/v1/users/:id/balance`               | ledger-derived user balance in credits + money display |
| POST   | `/v1/users/:id/payouts`               | request payout                                         |
| GET    | `/v1/users/:id/payouts`               | list user payouts                                      |
| GET    | `/v1/users/:id/referral-tree?depth=N` | referral tree                                          |
| POST   | `/v1/referrals/codes`                 | create referral code                                   |
| GET    | `/v1/referrals/codes/:code`           | resolve code                                           |
| POST   | `/v1/referrals/apply`                 | apply code                                             |
| POST   | `/v1/events`                          | ingest event                                           |

Behavior confirmed beyond the older snapshot:

- balance endpoint exists and is live in code
- payout endpoints exist and are mounted live
- event ingestion rejects non-base-currency events with `CURRENCY_NOT_SUPPORTED`

### 5.2 Admin API (`admin-api`, port 4001)

Protected by `BootstrapTokenGuard` using `UPRM_ADMIN_BOOTSTRAP_TOKEN`.

Current verified admin endpoints:

| Method | Path                         | Purpose                                        |
| ------ | ---------------------------- | ---------------------------------------------- |
| POST   | `/admin/tenants`             | create tenant and issue plaintext API key once |
| GET    | `/admin/tenants/:id`         | fetch tenant + config                          |
| GET    | `/admin/payouts/:id`         | fetch payout                                   |
| POST   | `/admin/payouts/:id/approve` | approve payout                                 |
| POST   | `/admin/payouts/:id/send`    | mark payout sent                               |
| POST   | `/admin/payouts/:id/fail`    | fail payout                                    |
| POST   | `/admin/payouts/:id/cancel`  | cancel payout                                  |

### 5.3 Worker status (`worker`, port 4002)

Verified live:

- `GET /healthz` -> `ok`
- `GET /metrics` -> Prometheus metrics output

Metrics exposure confirmed for outbox and rewards counters.

---

## 6. Event and reward pipeline

Current implemented flow:

1. tenant sends signed event to `POST /v1/events`
2. HMAC guard verifies signature
3. payload is validated by event schema
4. idempotent insert into `ingested_events`
5. outbox row written to `outbox_messages`
6. worker relay publishes to RabbitMQ
7. reward consumer processes event
8. reward scheduling writes deferred postings
9. worker scheduler posts due rewards into the ledger

Supported event schema includes:

- `user_registered`
- `email_verified`
- `subscription_started`
- `subscription_paid`
- `invoice_paid`
- `purchase_completed`
- `refund_issued`
- `subscription_cancelled`
- `chargeback_opened`
- `chargeback_won`
- `chargeback_lost`

Current correctness status relative to the older document:

- base-currency enforcement is implemented at the API boundary
- refund and chargeback compensation is implemented for reward handling
- pending scheduled rewards can be cancelled for compensating events
- posted rewards can be reversed by compensating logic

Still-open caveat:

- out-of-order event-link reconciliation is still not durably solved; linking still depends on prior-event availability in the current ingestion path.

---

## 7. Ledger and payouts

### 7.1 Ledger rules

Still true:

- money is stored as `BigInt` minor units
- ledger entries are immutable
- corrections happen through reversing entries
- idempotency is enforced at the ledger-entry level

### 7.2 Account taxonomy in live design

Live/accounting behavior now includes:

- `tenant_cash`
- `tenant_revenue`
- `tenant_reward_expense`
- `user_balance`
- `payout_payable`
- `platform_fee` reserved for future use

Important convention:

- `user_balance` is liability-style in raw ledger sums, so API-facing balance display negates the raw sum for user-visible credits.

### 7.3 Payout lifecycle

Phase 6 is implemented.

Current payout lifecycle:

- request payout: reserves balance by moving value from `user_balance` to `payout_payable`
- send payout: moves value from `payout_payable` to `tenant_cash`
- fail/cancel payout: releases value from `payout_payable` back to `user_balance`

Current state:

- payout domain package exists
- tenant payout request/list endpoints exist
- admin payout lifecycle endpoints exist
- Prisma model + migration for `payout_requests` exist and are applied in the live DB

---

## 8. Testing and verification

Verified during this session:

- clean git state
- systemd services active
- listeners present on 4000/4001/4002
- worker health and metrics endpoints live
- public HTTPS responding
- payout routes mounted live
- workspace safe test suite passes

Current passing test count from the verified safe suite: 75

Breakdown from the passing run:

- scheduler: 1
- tenants: 6
- identity: 6
- referrals: 7
- events: 7
- outbox: 4
- ledger unit tests: 8
- rewards: 18
- payouts: 6
- api-core: 8
- admin-api: 2
- worker: 2

Note: this is the verified current suite count, and it supersedes the older 59-test figure from the previous as-built snapshot.

---

## 9. Operations

### 9.1 Backup status

Automated backup is now present.

Verified:

- cron file exists at `/etc/cron.d/uprm-db-backup`
- schedule: daily at 02:15 UTC
- script: `/srv/uprm/scripts/backup-postgres.sh`
- retention is controlled by `RETENTION_DAYS=14`

This closes the earlier gap where no automated backup existed.

### 9.2 Prometheus status

Prometheus config is no longer empty.

Current config file:

- `/srv/uprm/infra/docker/prometheus.yml`

Configured scrape targets:

- `host.docker.internal:4000`
- `host.docker.internal:4001`
- `host.docker.internal:4002`

This supersedes the older note that UPRM-specific scrape jobs were missing.

---

## 10. Known open issues that are still real

These were re-checked against the current code and remain valid follow-up items:

1. Query-string signing gap

- `HmacAuthGuard` still verifies `req.url.split('?')[0]`
- consequence: query string is not covered by the HMAC signature

2. API key storage/recovery debt

- tenant API keys are still operationally limited and should be hardened with encrypted plaintext recovery/rotation strategy

3. Cross-package Prisma typing debt

- `Promise<any>` remains present in some domain services due to Prisma type inference friction across packages

4. systemd runtime shape

- services still use `pnpm run start` instead of `node dist/main.js`

5. Ledger trigger heuristic

- balanced-entry enforcement still uses the 1-second window heuristic

6. Scheduler concurrency hardening

- reward scheduling/posting path should still be reviewed for safe multi-worker locking behavior before horizontal scale

7. Out-of-order event-link durability

- unresolved prior-event relationships are still not staged/reconciled durably

---

## 11. What this document supersedes

This file supersedes the earlier pre-Phase-6 snapshot that still listed these as future work:

- balance endpoint
- base-currency enforcement
- refund/chargeback compensation
- payouts
- automated backups
- Prometheus scrape configuration

Those are no longer roadmap items. They are current system state.

---

## 12. Recommended next implementation target

From the actual current state, the highest-value next build target is:

- Phase 7 Stripe webhook adapter

Reason:

- it connects real payment-provider events into the event/reward/ledger/payout pipeline that now already exists
- it is the most natural continuation after the current backend foundation
