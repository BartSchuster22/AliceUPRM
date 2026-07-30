# UPRM — User / Payment / Referral Management

**Structured Implementation Guide & Prompt-by-Prompt Build Plan for the Coding AI Agent**

> Note: this file is the roadmap/design guide, not the live state record.
> The current audited implementation record is
> [`docs/PROJECT_EVALUATION.md`](docs/PROJECT_EVALUATION.md).
> Current development state must be determined from the live repo and VPS reality in this order: `git status/log` on `/srv/uprm`, actual source files/controllers/schema, and live runtime/DB checks.
> `UPRM_As_Built.md` is only a milestone snapshot and may be stale between milestones; do not use it as the default source of current development status.
>
> Live-state correction as of 2026-04-25: the former promoter/settlement placeholder warning is no longer current. The live repo/runtime now has a real promoter domain (manual applications, promoter status, auto-qualification metrics/worker loop) and a real settlement-cycle domain (persistent settlement cycles plus admin list/detail/open/close). Treat promoter + settlement as completed implementation domains unless a fresh live sighting proves otherwise.

- Admin subdomain: `uprm.aquiero.com`
- First tenant: **PSI** (Prefabricated Software Instances)
- Date: April 2026

---

## Table of Contents

**Part I — Executive Summary & Architectural Vision**

1. [Purpose and Rationale](#1-purpose-and-rationale)
2. [Core Architectural Principles](#2-core-architectural-principles)
3. [System Boundary & First Tenant](#3-system-boundary--first-tenant)

**Part II — Domain Architecture**

4. [The Four Core Domains](#4-the-four-core-domains)
5. [Identity / Global User Model](#5-identity--global-user-model)
6. [Payment Hub / Billing Domain](#6-payment-hub--billing-domain)
7. [Referral Engine & Graph](#7-referral-engine--graph)
8. [Treasury, Wallet & Double-Entry Ledger](#8-treasury-wallet--double-entry-ledger)

**Part III — Technical Stack & Deployment**

9. [Recommended Tech Stack](#9-recommended-tech-stack)
10. [Repository & Module Layout](#10-repository--module-layout)
11. [Docker Service Map](#11-docker-service-map)
12. [Security & Multi-Tenancy](#12-security--multi-tenancy)

**Part IV — Data Model Blueprint**

13. [Tenant, Identity, Referral Tables](#13-tenant-identity-referral-tables)
14. [Event, Reward, Ledger Tables](#14-event-reward-ledger-tables)
15. [Promoter, Treasury, Fraud, Audit Tables](#15-promoter-treasury-fraud-audit-tables)

**Part V — Rule Engine & API Contracts**

16. [Versioned Rule Engine (Reward & Promoter)](#16-versioned-rule-engine-reward--promoter)
17. [REST API Surface](#17-rest-api-surface)
18. [Event Flows (Signup, Paid, Refund)](#18-event-flows)

**Part VI — Prompt-by-Prompt Implementation Plan**

- [Phase 0 — Foundation](#phase-0--foundation)
- [Phase 1 — Identity & Tenancy](#phase-1--identity--tenancy)
- [Phase 2 — Referral Graph](#phase-2--referral-graph)
- [Phase 3 — Event Ingestion](#phase-3--event-ingestion)
- [Phase 4 — Ledger & Wallet](#phase-4--ledger--wallet)
- [Phase 5 — Reward Engine](#phase-5--reward-engine)
- [Phase 6 — Promoter Qualification](#phase-6--promoter-qualification)
- [Phase 7 — Refunds, Holds & Reversals](#phase-7--refunds-holds--reversals)
- [Phase 8 — Admin Backoffice](#phase-8--admin-backoffice)
- [Phase 9 — Webhooks, Fraud, Reporting](#phase-9--webhooks-fraud-reporting)
- [Phase 10 — PSI Integration](#phase-10--psi-integration)

**Part VII — [Risks, Milestones & MVP Scope](#part-vii--risks-milestones--mvp-scope)**

---

# Part I — Executive Summary & Architectural Vision

## 1. Purpose and Rationale

UPRM is a standalone backend platform that centrally manages user identity, payment events, referral relationships, and incentive accounting for one or more consumer-facing products. The first product using UPRM is **PSI** (Prefabricated Software Instances), an online platform selling pre-installed AI agent Docker containers on VPS infrastructure to private and small-business clients.

Instead of embedding user, payment, and referral logic inside PSI, these concerns are extracted into UPRM and consumed exclusively via a REST API. The PSI backend becomes UPRM's first API client. Future products (a second or third platform) can connect the same way without any rewrite of the incentive infrastructure.

> **Key Insight** — Even though PSI will be the only client in the beginning, UPRM is designed from day one as if it were a public multi-tenant SaaS. PSI accesses UPRM exclusively through signed REST calls — no shared database, no shortcut. This discipline is what makes later externalisation cheap instead of catastrophic.

## 2. Core Architectural Principles

- **Modular monolith first.** One main runtime, internally partitioned into strict domain modules with their own tables, services, and contracts. Microservices only when a module's load or team structure justifies the cost.
- **API-first, service-contract-first.** Every cross-domain access goes through an explicit interface; no module reaches directly into another module's tables.
- **Multi-tenant from day one.** Every business row carries a `tenant_id`. PSI is tenant #1.
- **Ledger as source of truth.** User balances are derived from an immutable double-entry ledger. A plain balance column is a read model, never authoritative.
- **Immutable event store.** Incoming tenant events are persisted exactly as received and never overwritten; derived state can be recomputed.
- **Versioned rule snapshots.** Every reward decision embeds the rule version that produced it, so historical payouts are always explainable.
- **Idempotency everywhere.** Every event accepts an `idempotency_key`; duplicate submissions can never create duplicate rewards.
- **Internal usage equals external usage.** PSI calls UPRM the same way a future third-party platform would.

## 3. System Boundary & First Tenant

UPRM exposes two API surfaces:

- A **public tenant API** (HMAC-signed API keys) used by PSI and future platforms to register users, post events, and query wallets or promoter status.
- An **internal admin API** (JWT / OIDC) consumed by the `uprm.aquiero.com` backoffice for tenant configuration, fraud review, manual adjustments, and settlement control.

PSI continues to own its product UI, container provisioning, and VPS orchestration. UPRM owns identity, payment events, referral graph, wallet, promoter status, and treasury. The two systems communicate only over the REST boundary.

---

# Part II — Domain Architecture

## 4. The Four Core Domains

Four domains are defined from day one with strict ownership boundaries. Within the modular monolith, each domain owns its own tables, services, and events. Cross-domain reads use internal interfaces or consumed events, never direct SQL.

| Domain                | Owns                                                          | Key responsibility                                    |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| **Identity**          | users, tenant_users, auth mappings, roles                     | Global user identity + per-tenant account mapping     |
| **Payment Hub**       | checkout sessions, subscriptions, invoices, PSP webhooks      | Normalises payment events from Stripe and future PSPs |
| **Referral Engine**   | referral codes, edges, ancestry, reward rules, promoter logic | Graph + reward decisioning + promoter state           |
| **Treasury / Wallet** | ledger accounts, ledger entries, transactions, settlements    | Immutable financial record and liability tracking     |

## 5. Identity / Global User Model

A user is modelled as a **global identity** that can exist across multiple tenants. Each tenant has its own per-tenant account mapping to that global identity.

- `users` (global): `id, email_normalized, email_verified, status, created_at, updated_at`
- `tenant_users` (per-tenant): `id, tenant_id, user_id, external_user_id, username, tenant_status, joined_at, metadata_json` — UNIQUE on `(tenant_id, external_user_id)`
- `signed_up_platform`: retained on the `tenant_users` row as the origin tenant; the global user may later gain additional tenant memberships.

> **Design note** — PSI keeps its own minimal user profile locally (only what it needs for product operations) and references UPRM's global user ID for every identity-critical operation. Authentication itself can be delegated to UPRM or mirrored from it, depending on the phase.

## 6. Payment Hub / Billing Domain

The Payment Hub normalises all payment-related events into a single internal contract regardless of PSP. Phase 1 supports Stripe only; phase 2+ can add other providers without changing downstream logic.

- **Responsibilities**: receive PSP webhooks, verify signatures, normalise to canonical events (`subscription_started`, `subscription_paid`, `invoice_paid`, `refund_issued`, `chargeback_opened`, `chargeback_won`, `chargeback_lost`), persist immutably, publish to event bus.
- PSI's current Stripe integration must be documented, then migrated into UPRM's Payment Hub. PSI keeps only a thin checkout redirect + webhook forwarder, or lets UPRM host the webhook endpoint directly.

## 7. Referral Engine & Graph

The referral engine stores direct parent edges and derives deeper ancestry on demand or via a materialised table.

- **Direct edge**: `referral_edges` holds exactly one parent per `(tenant, referred_user)` — locked after first paid conversion.
- **Ancestry projection**: `referral_ancestry` stores `(ancestor, descendant, depth)` for fast L2+ lookups.
- **Depth**: design for infinite depth even though only L1 and L2 are rewarded at launch; `max_reward_depth` is a rule-config value, not a schema constant.
- **Circular protection**: self-referral and cycles are rejected at edge-creation time.

## 8. Treasury, Wallet & Double-Entry Ledger

The financial core is a **double-entry ledger**. Every reward, hold, release, reversal, and spend is recorded as a balanced transaction with at least one debit and one credit.

**Example — User B pays on tenant PSI, User A earns 10 L1 credits:**

```
Transaction: reward_for_paid_subscription
  Debit  tenant:PSI / reward_expense_account     10.00
  Credit user:A    / wallet_available_account    10.00
```

**Example — with a 14-day unlock delay:**

```
At reward creation:
  Debit  tenant:PSI / reward_expense_account     10.00
  Credit user:A    / wallet_pending_account      10.00

At unlock (scheduler, T+14 days):
  Debit  user:A    / wallet_pending_account      10.00
  Credit user:A    / wallet_available_account    10.00
```

**Example — refund reverses the original reward:**

```
Transaction: refund_reversal (links to original reward transaction)
  If credits still in wallet:
    Debit  user:A  / wallet_available_account    10.00
    Credit tenant:PSI / reward_expense_account   10.00

  If credits already spent:
    Debit  user:A  / recoverable_debt_account    10.00
    Credit tenant:PSI / reward_expense_account   10.00
```

> ⚠️ **Critical rule** — `wallet_balances` is a derived read model, updated from ledger entries. The ledger is the single source of truth; balance fields are a cache that can be rebuilt from the ledger at any time.

---

# Part III — Technical Stack & Deployment

## 9. Recommended Tech Stack

| Layer              | Choice                               | Rationale                                                       |
| ------------------ | ------------------------------------ | --------------------------------------------------------------- |
| Language / runtime | TypeScript on Node.js 20 LTS         | Matches likely frontend stack; strong ecosystem; fast iteration |
| Web framework      | NestJS (or Fastify + light DI)       | Module-per-domain maps cleanly to NestJS modules                |
| ORM / SQL          | Prisma or Drizzle                    | Type-safe migrations, multi-tenant scoping                      |
| Database           | PostgreSQL 16                        | Transactions, JSONB rules, row-scoped multi-tenancy             |
| Cache / locks      | Redis 7                              | Idempotency keys, rate limits, distributed locks                |
| Broker             | RabbitMQ                             | Simple durable queues; swap to Kafka only if volume demands it  |
| Object storage     | MinIO (S3-compatible)                | Influencer proofs, CSV exports, audit bundles                   |
| Observability      | Prometheus + Grafana + Loki + OTel   | Metrics, dashboards, logs, traces                               |
| Admin frontend     | React + Vite (served from admin-api) | `uprm.aquiero.com` backoffice                                   |

## 10. Repository & Module Layout

```
/uprm
 /apps
   /api-core         # public tenant API (HMAC keys)
   /worker           # async processors (reward, fraud, webhooks)
   /scheduler        # cron (promoter eval, unlocks, settlement)
   /admin-api        # internal JWT/OIDC admin API + admin UI
 /packages
   /domain
     /auth
     /tenants
     /identity
     /payments
     /referrals
     /events
     /rewards
     /promoter
     /wallet
     /treasury
     /fraud
     /reporting
   /db               # Prisma schema, migrations, repository helpers
   /messaging        # outbox + broker adapters
   /config
   /utils
 /infra
   /docker           # docker-compose, Dockerfiles
   /k8s              # later: Helm charts
   /terraform        # later: VPS / cloud provisioning
```

## 11. Docker Service Map

| Container                         | Purpose                                         | Scales                         |
| --------------------------------- | ----------------------------------------------- | ------------------------------ |
| `api-core`                        | Public REST API for tenants                     | Horizontal                     |
| `worker`                          | Consumes events, runs reward/fraud/webhook jobs | Horizontal                     |
| `scheduler`                       | Cron: promoter eval, unlocks, settlement cycles | Singleton                      |
| `admin-api`                       | Backoffice API + static admin UI                | Horizontal                     |
| `postgres`                        | Primary database                                | Vertical first, replicas later |
| `redis`                           | Cache, idempotency, locks                       | Horizontal later               |
| `rabbitmq`                        | Message broker with outbox pattern              | Cluster later                  |
| `minio`                           | S3-compatible object storage                    | Cluster later                  |
| `prometheus` / `grafana` / `loki` | Metrics, dashboards, logs                       | Single host first              |

## 12. Security & Multi-Tenancy

- Tenant API keys are stored as hashes (`key_hash`) with a visible prefix. Rotation and revocation supported by default.
- Tenants authenticate via HMAC-signed requests; every event carries an `idempotency_key` and an `external_event_id`.
- Admin authentication uses JWT/OIDC with RBAC; sensitive admin actions require a second factor in phase 2.
- Webhooks leaving UPRM are signed; webhooks arriving (PSP, tenants) are verified before persistence.
- Every business row carries `tenant_id`. The service layer enforces scoping; a middleware injects the current tenant into every query.
- **No shared database access.** PSI and UPRM have separate databases even if deployed on the same host.

---

# Part IV — Data Model Blueprint

## 13. Tenant, Identity, Referral Tables

### Tenants

```sql
tenants(id, name, slug, status, base_currency, created_at, updated_at)
tenant_api_keys(id, tenant_id, key_hash, key_prefix, scopes, status, last_used_at, created_at)
tenant_configs(tenant_id, reward_config_json, promoter_config_json,
               fraud_config_json, webhook_config_json, updated_at)
```

### Identity

```sql
users(id, email_normalized UNIQUE, email_verified, status, created_at, updated_at)
tenant_users(id, tenant_id, user_id, external_user_id, username,
             tenant_status, joined_at, metadata_json,
             UNIQUE(tenant_id, external_user_id))
```

### Referrals

```sql
referral_codes(id, tenant_id, tenant_user_id, code UNIQUE(tenant_id, code),
               status, created_at, expires_at)

referral_edges(id, tenant_id,
               referrer_tenant_user_id, referred_tenant_user_id,
               source_code_id, attribution_method,
               created_at, locked_at,
               UNIQUE(tenant_id, referred_tenant_user_id))

referral_ancestry(tenant_id, ancestor_tenant_user_id,
                  descendant_tenant_user_id, depth, created_at,
                  PK(tenant_id, descendant, ancestor))
```

## 14. Event, Reward, Ledger Tables

### Events

```sql
ingested_events(id, tenant_id, event_type, external_event_id,
                external_user_id, tenant_user_id,
                payload_json, occurred_at, received_at,
                idempotency_key, processing_status,
                processing_attempts, error_code, error_message,
                UNIQUE(tenant_id, idempotency_key))

event_links(id, tenant_id, event_id, linked_event_id, link_type)
-- link_type examples: refund_of, chargeback_of, renewal_of
```

### Reward decisions

```sql
reward_decisions(id, tenant_id, source_event_id,
                 beneficiary_tenant_user_id,
                 reward_type, reward_level,   -- L1 | L2 | promoter_bonus | manual
                 amount, currency_or_unit,
                 status,                       -- pending | approved | held | reversed | rejected
                 reason_code, rule_snapshot_json,
                 created_at, updated_at)
```

### Ledger

```sql
ledger_accounts(id, tenant_id, account_type, owner_type, owner_id,
                unit, status, created_at)
-- account_type examples: wallet_available, wallet_pending, reward_expense,
-- recoverable_debt, settlement_payable, settlement_receivable

ledger_transactions(id, tenant_id, transaction_type,
                    reference_type, reference_id,
                    status, created_at)

ledger_entries(id, transaction_id, account_id,
               direction,                    -- debit | credit
               amount, unit, created_at)
-- INVARIANT: SUM(debits) == SUM(credits) per transaction_id
```

### Wallet read model

```sql
wallet_balances(tenant_id, tenant_user_id,
                available_balance, pending_balance, locked_balance,
                spent_lifetime, earned_lifetime, updated_at)
```

## 15. Promoter, Treasury, Fraud, Audit Tables

### Promoter

```sql
promoter_profiles(tenant_id, tenant_user_id,
                  promoter_status,             -- user | promoter | pending_review | suspended | demoted
                  qualification_source,        -- auto | manual
                  manual_override, effective_from, effective_to, updated_at)

promoter_applications(id, tenant_id, tenant_user_id,
                      submitted_at, status,
                      reviewed_by_admin_id, reviewed_at, notes)

promoter_application_links(id, application_id, link_type, url,
                           verification_status, proof_json)

promoter_metrics_daily(tenant_id, tenant_user_id, date,
                       new_paid_referrals_count, gross_revenue_referred,
                       net_reward_generated, refund_count)
```

### Treasury

```sql
tenant_treasury_accounts(id, tenant_id, account_type, status, created_at)
settlement_cycles(id, period_start, period_end, status, created_at, closed_at)
settlement_lines(id, settlement_cycle_id,
                 from_tenant_id, to_tenant_id, amount, unit, status)
```

### Fraud & audit

```sql
risk_signals(id, tenant_id, tenant_user_id, signal_type,
             signal_score, payload_json, created_at)
risk_cases(id, tenant_id, tenant_user_id, severity, status,
           opened_at, closed_at, resolution_note)
audit_logs(id, actor_type, actor_id, action,
           entity_type, entity_id, before_json, after_json, created_at)
```

---

# Part V — Rule Engine & API Contracts

## 16. Versioned Rule Engine (Reward & Promoter)

All reward and promoter logic is **configuration** — never hardcoded. Every `reward_decision` stores a `rule_snapshot_json`, which is the exact rule version that produced it.

### Reward config

```json
{
  "version": 1,
  "rewardable_events": ["subscription_paid", "purchase_completed"],
  "levels": [
    { "level": 1, "reward_type": "fixed_credit", "amount": 10 },
    { "level": 2, "reward_type": "fixed_credit", "amount": 3 }
  ],
  "unlock_delay_days": 14,
  "refund_reversal_enabled": true,
  "max_reward_depth": 2
}
```

### Promoter config

```json
{
  "version": 1,
  "auto_promoter_rule": {
    "required_paid_referrals": 5,
    "window_days": 30
  },
  "retention_rules": [
    { "window_days": 60, "minimum_paid_referrals": 3 },
    { "window_days": 90, "minimum_paid_referrals": 1 }
  ],
  "manual_promoter_review_enabled": true
}
```

## 17. REST API Surface

### Public tenant API

| Method / Path                             | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `POST /v1/referrals/codes`                | Create a referral code for a tenant_user               |
| `GET /v1/referrals/codes/:code`           | Resolve a code to its owner                            |
| `GET /v1/users/:id/referrals`             | List users a given user has referred                   |
| `GET /v1/users/:id/referral-tree?depth=2` | Return the ancestry tree                               |
| `POST /v1/events`                         | Submit a tenant event (generic, typed by `event_type`) |
| `GET /v1/users/:id/wallet`                | Return wallet balances                                 |
| `GET /v1/users/:id/wallet/transactions`   | Paginated statement                                    |
| `GET /v1/users/:id/promoter-status`       | Current promoter status                                |
| `POST /v1/promoter-applications`          | Submit promoter application                            |
| `GET /v1/webhooks/deliveries`             | Outbound webhook delivery log                          |
| `POST /v1/webhooks/test`                  | Test webhook delivery to tenant endpoint               |

### Admin API

| Method / Path                                   | Purpose                                |
| ----------------------------------------------- | -------------------------------------- |
| `POST /admin/tenants`                           | Onboard a new tenant                   |
| `PATCH /admin/tenants/:id/config`               | Update tenant config (rules, webhooks) |
| `POST /admin/promoter-applications/:id/approve` | Approve promoter application           |
| `POST /admin/promoter-applications/:id/reject`  | Reject promoter application            |
| `POST /admin/users/:id/adjust-balance`          | Manual ledger-backed credit adjustment |
| `POST /admin/users/:id/set-promoter-status`     | Manual promoter status override        |
| `GET /admin/fraud/cases`                        | List fraud cases                       |
| `POST /admin/fraud/cases/:id/resolve`           | Close a fraud case with note           |
| `GET /admin/settlements/cycles`                 | List settlement cycles                 |
| `POST /admin/settlements/cycles/:id/close`      | Close and freeze a settlement cycle    |

## 18. Event Flows

### Signup flow

```
1. User B signs up on PSI using referral code CODE_A.
2. PSI backend -> POST /v1/events
     { event_type: "user_registered",
       external_user_id: "psi-uuid-B",
       referral_code: "CODE_A",
       idempotency_key: "evt-...", external_event_id: "..." }
3. UPRM resolves code -> owner = tenant_user A.
4. Creates tenant_user B (if new) and global user.
5. Inserts referral_edges(A -> B), locks on first paid event.
6. No reward unless signup rewards are enabled in rule config.
```

### Paid subscription flow

```
1. Stripe webhook -> UPRM Payment Hub -> normalised subscription_paid.
2. Event stored immutably, published to queue.
3. Worker:
     - resolves referrer = A (L1), A's referrer = X (L2)
     - loads current reward_config snapshot
     - checks fraud rules and user eligibility
     - emits reward_decisions for A (L1, 10) and X (L2, 3)
     - posts balanced ledger transactions (pending if unlock_delay > 0)
     - updates promoter_metrics_daily for A
4. Scheduler moves pending -> available after unlock_delay_days.
```

### Refund flow

```
1. Stripe webhook -> refund_issued, linked to original subscription_paid.
2. Worker looks up reward_decisions tied to original event.
3. For each reward:
     - if still in wallet_pending -> void
     - if in wallet_available -> debit available, credit reward_expense
     - if already spent -> debit recoverable_debt, credit reward_expense
4. promoter_metrics_daily decremented; promoter status re-evaluated.
```

---

# Part VI — Prompt-by-Prompt Implementation Plan

This section is the **working paper for the coding AI agent**. Each numbered prompt is a self-contained instruction: a goal, a set of instructions, the expected deliverables, and measurable acceptance criteria. The agent should complete prompts in order, committing after each, and should stop and ask only when a dependency is missing.

> **How the coding agent should use this section** — Read the prompt fully before starting. Do not jump ahead. After completing a prompt, run the acceptance checks, commit with the prompt ID in the message (for example: `feat(UPRM-P2.1): create tenant module`), and then move to the next prompt. If a prompt requires a decision that the document does not make, pause and ask the human operator.

---

## Phase 0 — Foundation

### PROMPT P0.1 — Bootstrap the monorepo and toolchain

**Goal:** Create the `/uprm` monorepo with pnpm workspaces, TypeScript strict mode, ESLint, Prettier, Husky, and commitlint.

**Instructions to the coding agent:**

1. Initialise a pnpm workspace at the root with `apps/*` and `packages/*` globs.
2. Add TypeScript 5.x with a shared `tsconfig.base.json` using `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
3. Configure ESLint with `@typescript-eslint`, `import`, and `unused-imports` plugins. Configure Prettier (`singleQuote: true`, `trailingComma: all`, `printWidth: 100`).
4. Add Husky pre-commit running `lint-staged` on `*.ts` and `*.md`. Add commitlint with conventional-commits.
5. Create a root `README.md` that documents how to bootstrap, run, and test the monorepo.

**Deliverables:**

- Folder tree matching Section 10 of this document.
- `pnpm install` completes with zero errors.
- `pnpm -r lint` and `pnpm -r typecheck` pass on empty packages.
- A single commit `chore(UPRM-P0.1): bootstrap monorepo` on main.

**Acceptance criteria:**

- Fresh clone + `pnpm install` + `pnpm -r build` succeeds in under 2 minutes.
- A deliberately bad commit message is rejected by commitlint.
- A staged file with a lint error is rejected by Husky.

---

### PROMPT P0.2 — Provision infrastructure with Docker Compose

**Goal:** Create an `infra/docker/docker-compose.dev.yml` that spins up postgres, redis, rabbitmq, minio, prometheus, grafana, loki locally.

**Instructions to the coding agent:**

1. Use pinned image versions: `postgres:16`, `redis:7-alpine`, `rabbitmq:3-management`, `minio/minio:latest`, `prom/prometheus`, `grafana/grafana`, `grafana/loki`.
2. Expose ports only on `127.0.0.1` in dev.
3. Mount named volumes for postgres, rabbitmq, minio data so restarts preserve state.
4. Add a single `.env.example` documenting every variable, including `POSTGRES_USER/PASSWORD`, `RABBITMQ_DEFAULT_USER/PASS`, `MINIO_ROOT_USER/PASSWORD`, and a single `UPRM_MASTER_SECRET` used later for HMAC.
5. Provide a `make up` / `make down` / `make reset` Makefile for convenience.

**Deliverables:**

- `infra/docker/docker-compose.dev.yml`
- `.env.example` at repo root
- `Makefile` with `up`, `down`, `logs`, `reset`, `psql` targets
- `docs/infra.md` describing how each container is used

**Acceptance criteria:**

- `make up` brings all services to healthy state.
- `make reset` wipes volumes and rebuilds from scratch.
- Grafana is reachable on `http://localhost:3001` with `admin/admin` and loads a blank dashboard.

---

### PROMPT P0.3 — Shared database package with Prisma

**Goal:** Create `packages/db` containing the Prisma schema, a typed client, and a migration workflow.

**Instructions to the coding agent:**

1. Install `prisma` and `@prisma/client` in `packages/db`.
2. Create an empty Prisma schema pointing at `DATABASE_URL`.
3. Add npm scripts: `db:migrate:dev`, `db:migrate:deploy`, `db:studio`, `db:generate`.
4. Export a `PrismaClient` singleton with a `withTenant(tenantId)` extension that automatically injects `tenant_id` into selects and inserts where a `tenantId` column exists.
5. Document the multi-tenant scoping rule in `packages/db/README.md`.

**Deliverables:**

- `packages/db` with Prisma schema, generated client, and README
- Tenant-scoping extension with unit tests

**Acceptance criteria:**

- `pnpm --filter db db:migrate:dev` creates an empty baseline migration.
- Unit tests for the `withTenant` extension pass.
- Attempting a cross-tenant read in tests throws a `TenantScopeError`.

---

## Phase 1 — Identity & Tenancy

### PROMPT P1.1 — Tenants & API keys

**Goal:** Implement the Tenants domain module with CRUD, config storage, and HMAC-signed API keys.

**Instructions to the coding agent:**

1. Add Prisma models: `Tenant`, `TenantApiKey`, `TenantConfig` (with JSONB fields `reward_config`, `promoter_config`, `fraud_config`, `webhook_config`).
2. Create `packages/domain/tenants` with a `TenantService` exposing: `createTenant`, `getTenant`, `updateConfig`, `issueApiKey`, `revokeApiKey`, `verifySignedRequest`.
3. API key format: prefix (8 chars, visible) + random body (32 bytes); store only a SHA-256 of prefix+body. `verifySignedRequest` checks an `Authorization: UPRM-HMAC <keyId>:<ts>:<sig>` header using HMAC-SHA256 over `method+path+body+timestamp`, with a 5-minute skew window.
4. Add an admin endpoint `POST /admin/tenants` and `PATCH /admin/tenants/:id/config` in `apps/admin-api`.
5. Add a `HmacAuthGuard` used by `apps/api-core` to authenticate tenant requests.

**Deliverables:**

- Prisma migration `0001_tenants.sql`
- `TenantService` with 100% unit test coverage on `verifySignedRequest`
- Admin endpoints for tenant creation and config update
- `HmacAuthGuard` consumed by `api-core`

**Acceptance criteria:**

- Creating a tenant returns an API key exactly once; subsequent reads return only the prefix.
- Replayed request (same timestamp, outside skew window) is rejected.
- Tampered body produces a 401.

---

### PROMPT P1.2 — Identity: global users & tenant_users

**Goal:** Implement the Identity module with global users, per-tenant mapping, and email normalisation.

**Instructions to the coding agent:**

1. Add Prisma models `User` and `TenantUser` per Section 13. Enforce `UNIQUE(email_normalized)` on `User` and `UNIQUE(tenant_id, external_user_id)` on `TenantUser`.
2. Create `packages/domain/identity` with `IdentityService`: `findOrCreateUserByEmail`, `linkTenantUser`, `getTenantUser`, `updateTenantUserStatus`.
3. Expose endpoints on `api-core`: `POST /v1/users`, `GET /v1/users/:id`, `PATCH /v1/users/:id` — all tenant-scoped via `HmacAuthGuard`.
4. Emit a domain event `TenantUserCreated` to the outbox on first creation.
5. Email normalisation: lowercase, trim, strip dots from `gmail.com` local-part, remove `+subaddress`.

**Deliverables:**

- Prisma migration `0002_identity.sql`
- `IdentityService` with unit tests covering email-normalisation edge cases and tenant isolation
- OpenAPI document generated from the identity endpoints

**Acceptance criteria:**

- Creating the same email on two different tenants produces one `User` row and two `TenantUser` rows.
- Creating the same `external_user_id` twice for the same tenant returns the existing record (idempotent).

---

## Phase 2 — Referral Graph

### PROMPT P2.1 — Referral codes and edges

**Goal:** Implement referral codes, edge creation with cycle protection, and the locking rule.

**Instructions to the coding agent:**

1. Add Prisma models `ReferralCode`, `ReferralEdge` per Section 13.
2. `ReferralService.createCode(tenantUserId)` generates a 10-char base32 code unique per tenant.
3. `ReferralService.applyCode({ tenantId, referredTenantUserId, code })` creates an edge if none exists. Reject if the code resolves to the same user (self-referral) or if any ancestor path from referrer already includes `referredTenantUserId` (cycle).
4. Edges remain mutable until first paid event linked to the referred user locks them (sets `locked_at`).
5. Expose endpoints: `POST /v1/referrals/codes`, `GET /v1/referrals/codes/:code`, `POST /v1/referrals/apply`.

**Deliverables:**

- Prisma migration `0003_referrals.sql`
- `ReferralService` + unit tests for self-referral, cycles, duplicate attribution, and lock behaviour

**Acceptance criteria:**

- Applying the same code twice for the same referred user is idempotent before lock and a hard error after lock.
- A cycle `A->B->C->A` is rejected at `C->A`.

---

### PROMPT P2.2 — Ancestry projection & tree queries

**Goal:** Add the `referral_ancestry` materialised table and maintain it on edge creation.

**Instructions to the coding agent:**

1. Add Prisma model `ReferralAncestry` per Section 13.
2. When an edge `A->B` is created, insert ancestry rows: `(B, B, 0)`, then for each existing `(X, A, d)` insert `(X, B, d+1)` up to a configurable `MAX_DEPTH` (default 20, not a reward cap).
3. Expose `GET /v1/users/:id/referral-tree?depth=N` returning a JSON tree.
4. Add a rebuild script `pnpm run referrals:rebuild-ancestry` that recomputes the table from edges.

**Deliverables:**

- Prisma migration `0004_referral_ancestry.sql`
- Maintenance hook in `ReferralService.applyCode`
- CLI rebuild script

**Acceptance criteria:**

- Ancestry rebuild on a 10k-edge fixture completes in under 10 seconds.
- Tree query for `depth=2` returns L1 and L2 descendants correctly.

---

## Phase 3 — Event Ingestion

### PROMPT P3.1 — Generic event ingestion endpoint with outbox

**Goal:** Implement `POST /v1/events` with idempotency, schema validation, and a transactional outbox.

**Instructions to the coding agent:**

1. Add Prisma models `IngestedEvent` and `OutboxMessage`. Add `UNIQUE(tenant_id, idempotency_key)`.
2. Define Zod schemas per `event_type`: `user_registered`, `email_verified`, `subscription_started`, `subscription_paid`, `invoice_paid`, `purchase_completed`, `refund_issued`, `subscription_cancelled`, `chargeback_opened`, `chargeback_won`, `chargeback_lost`.
3. `EventIngestionService.ingest({ tenantId, body })` validates, inserts `IngestedEvent`, inserts `OutboxMessage`, all in one DB transaction.
4. Build an outbox relay that polls the outbox table and publishes to RabbitMQ exchange `uprm.events` with routing key = `event_type`. Mark rows dispatched on ack.
5. Return `202 Accepted` with `{ event_id, processing_status: 'queued' }`.

**Deliverables:**

- Prisma migration `0005_events_outbox.sql`
- `EventIngestionService` + Zod schemas in `packages/domain/events`
- Outbox relay worker in `apps/worker`

**Acceptance criteria:**

- Submitting the same `idempotency_key` twice returns the original `event_id` without a duplicate row.
- A crash between DB commit and broker publish does not lose the event: the relay retries until acked.
- Invalid payloads return 422 with a field-level error list.

---

### PROMPT P3.2 — Stripe Payment Hub adapter

**Goal:** Migrate PSI's current Stripe integration into a UPRM Payment Hub module that normalises PSP webhooks into canonical events.

**Instructions to the coding agent:**

1. Document PSI's existing Stripe flow in `docs/payments/psi-stripe-as-is.md` before writing any code.
2. Create `packages/domain/payments` with a `StripeAdapter` that verifies webhook signatures using `STRIPE_WEBHOOK_SECRET` and maps: `checkout.session.completed` -> `subscription_started`, `invoice.paid` -> `subscription_paid`/`invoice_paid`, `charge.refunded` -> `refund_issued`, `charge.dispute.*` -> `chargeback_*`.
3. Expose `POST /v1/payments/webhooks/stripe` on `api-core`. Each normalised event is injected into `EventIngestionService.ingest()` with a deterministic `idempotency_key` derived from the Stripe event id.
4. Keep raw Stripe payload in `IngestedEvent.payload_json` alongside the canonical fields.

**Deliverables:**

- `docs/payments/psi-stripe-as-is.md`
- `StripeAdapter` + mapping unit tests with real Stripe fixtures
- Webhook endpoint protected by signature verification

**Acceptance criteria:**

- Replaying the same Stripe webhook does not double-count the event.
- Every canonical event also preserves the original Stripe event id in `payload_json.original_event_id`.

---

## Phase 4 — Ledger & Wallet

### PROMPT P4.1 — Double-entry ledger core

**Goal:** Implement the immutable double-entry ledger with a balance invariant.

**Instructions to the coding agent:**

1. Add Prisma models `LedgerAccount`, `LedgerTransaction`, `LedgerEntry` per Section 14.
2. Create `packages/domain/wallet` with `LedgerService.postTransaction({ tenantId, type, referenceType, referenceId, entries })` that inserts a transaction and its entries atomically.
3. Enforce invariant `SUM(debit)=SUM(credit)` at service level AND as a deferred DB check via a trigger or a check via a stored procedure on commit.
4. Provide helpers `getOrCreateAccount({ tenantId, accountType, ownerType, ownerId, unit })` and `getAccountBalance(accountId)` (sum of entries).

**Deliverables:**

- Prisma migration `0006_ledger.sql` including a balance-enforcing trigger
- `LedgerService` with property-based tests verifying balance invariant over random entry sets

**Acceptance criteria:**

- Attempting to post an unbalanced transaction throws `LedgerUnbalancedError` and leaves no rows.
- Concurrent posts to the same account do not corrupt balances (test with 100 concurrent jobs).

---

### PROMPT P4.2 — Wallet read model and statement API

**Goal:** Maintain `wallet_balances` as a derived projection and expose wallet endpoints.

**Instructions to the coding agent:**

1. Add Prisma model `WalletBalance` per Section 14.
2. On every `LedgerService.postTransaction` involving a user's `wallet_available`, `wallet_pending`, or `recoverable_debt` account, update `wallet_balances` in the same DB transaction.
3. Add a `pnpm run wallet:rebuild` CLI that recomputes `wallet_balances` from `ledger_entries`.
4. Expose `GET /v1/users/:id/wallet` and `GET /v1/users/:id/wallet/transactions` (paginated, cursor on `created_at + id`).

**Deliverables:**

- `WalletService` + rebuild CLI
- Endpoints with OpenAPI schemas

**Acceptance criteria:**

- After any sequence of ledger postings, `wallet:rebuild` produces identical results to the live projection.
- Statement endpoint returns stable ordered pages under concurrent writes.

---

## Phase 5 — Reward Engine

### PROMPT P5.1 — Reward engine worker

**Goal:** Consume `subscription_paid` / `purchase_completed` events and emit reward decisions + ledger postings.

**Instructions to the coding agent:**

1. Create a RabbitMQ consumer in `apps/worker` subscribed to rewardable event types.
2. For each event: load tenant `reward_config`, resolve referrer chain from `referral_ancestry` up to `max_reward_depth`, check fraud flags (Phase 9 stub returns allow), emit a `reward_decisions` row per eligible level with `rule_snapshot_json` = current config.
3. Post ledger transactions: debit tenant `reward_expense`, credit beneficiary's `wallet_pending` (if `unlock_delay_days > 0`) or `wallet_available` (if 0).
4. Ensure `reward_decisions` carry `status=pending` while in `wallet_pending` and `status=approved` when unlocked.

**Deliverables:**

- Reward worker with integration tests end-to-end: ingest `subscription_paid` -> pending balance visible on wallet endpoint

**Acceptance criteria:**

- A paid event with a 2-level chain creates exactly two `reward_decisions` and one balanced ledger transaction per decision.
- Replaying the same event produces no new decisions (idempotency by `source_event_id + beneficiary + level` UNIQUE).

---

### PROMPT P5.2 — Unlock scheduler

**Goal:** Move pending rewards to available after `unlock_delay_days`.

**Instructions to the coding agent:**

1. Add a nightly scheduler job in `apps/scheduler` that selects `reward_decisions` in `status=pending` with `created_at <= now - unlock_delay_days` and not linked to a refund.
2. For each, post a ledger transaction debiting `wallet_pending` and crediting `wallet_available`, update `status=approved`.
3. All in a single DB transaction per decision; emit a `WalletBalanceChanged` outbox message.

**Deliverables:**

- Scheduler job with a dry-run mode and a metrics counter `uprm_unlocks_total`

**Acceptance criteria:**

- A decision refunded during the pending window is skipped by the unlocker.
- Running the unlocker twice on the same day produces no double movements.

---

## Phase 6 — Promoter Qualification

### PROMPT P6.1 — Promoter metrics & auto-qualification

**Goal:** Compute daily promoter metrics and evaluate promoter status transitions against `promoter_config`.

**Instructions to the coding agent:**

1. Populate `promoter_metrics_daily` from ledger and `reward_decisions` via an idempotent rollup job.
2. Evaluator job runs daily: for each `tenant_user`, count paid referrals in each configured window, compare against thresholds, compute target status (`user`, `promoter`, `pending_review`, `suspended`, `demoted`).
3. Writes `promoter_profiles` with `effective_from=today`, `effective_to=null` on transition. Previous row gets `effective_to=today`.
4. Emit `PromoterStatusChanged` event on every transition.

**Deliverables:**

- Promoter evaluator + history table maintenance
- Admin endpoint `GET /v1/users/:id/promoter-status`

**Acceptance criteria:**

- A user who hits 5 paid referrals in 30 days is promoted on the next evaluator run.
- A user falling below the 60-day retention threshold is demoted on the next run, with correct effective dating.

---

### PROMPT P6.2 — Manual promoter applications

**Goal:** Let users apply for promoter status and let admins approve or reject.

**Instructions to the coding agent:**

1. Add Prisma models `promoter_applications` and `promoter_application_links` per Section 15.
2. Endpoints: `POST /v1/promoter-applications` (tenant), `POST /admin/promoter-applications/:id/approve`, `POST /admin/promoter-applications/:id/reject`.
3. Approval writes a `promoter_profiles` row with `qualification_source=manual` and `manual_override=true`; rejection records notes.
4. Uploaded proofs (screenshots, links) go to MinIO under `applications/{id}/`.

**Deliverables:**

- Application flow + admin review UI wireframe in `admin-api`

**Acceptance criteria:**

- Approved applications override the auto-evaluator until `manual_override` is cleared.
- Audit log entries exist for every admin decision.

---

## Phase 7 — Refunds, Holds & Reversals

### PROMPT P7.1 — Refund reversal handler

**Goal:** Reverse reward decisions tied to refunded or charged-back events.

**Instructions to the coding agent:**

1. Consumer subscribes to `refund_issued`, `chargeback_won`, `chargeback_lost`.
2. Resolve original event via `event_links.link_type` in `(refund_of, chargeback_of)`.
3. For each `reward_decisions` tied to the original: if pending -> void (debit `wallet_pending`, credit `reward_expense`, `status=reversed`). If approved and balance sufficient in `wallet_available` -> debit `wallet_available`, credit `reward_expense`. If approved and spent -> debit `recoverable_debt`, credit `reward_expense`.
4. Update `promoter_metrics_daily` decrement and trigger a re-evaluation on the affected user.

**Deliverables:**

- Refund worker with integration tests covering all three reversal paths

**Acceptance criteria:**

- No reversal path can produce an unbalanced ledger transaction.
- A partial refund reverses only the pro-rata share per config.

---

## Phase 8 — Admin Backoffice

### PROMPT P8.1 — Admin-api skeleton with JWT/OIDC

**Goal:** Stand up the `admin-api` with authentication and RBAC.

**Instructions to the coding agent:**

1. Use OIDC (e.g. Authelia, Auth0, or Keycloak) for admin login; `admin-api` validates JWTs.
2. RBAC roles: `super_admin`, `tenant_admin`, `fraud_reviewer`, `support`. Persist role grants in an `AdminUser` table.
3. Every admin mutation writes an `audit_logs` row with `before_json` / `after_json`.
4. Serve a static React admin UI from `admin-api` at `uprm.aquiero.com`.

**Deliverables:**

- `admin-api` app with auth, RBAC middleware, and audit middleware
- React + Vite admin shell with tenant switcher and navigation

**Acceptance criteria:**

- Unauthenticated requests to any `/admin/*` endpoint return 401.
- A `fraud_reviewer` cannot call `/admin/tenants` endpoints (403).

---

### PROMPT P8.2 — Admin screens: tenants, users, wallets, promoters, fraud

**Goal:** Build the essential admin screens for operating UPRM.

**Instructions to the coding agent:**

1. Tenants list + detail (config editor for reward/promoter JSON with schema validation).
2. Users search, user detail showing wallet, ledger statement, referral tree, promoter history.
3. Manual balance adjustment form: requires `reason_code` and produces a ledger transaction of type `manual_adjustment`.
4. Promoter applications queue with approve/reject actions.
5. Fraud cases list with severity filter and resolution form.
6. Settlement cycles list with close action (Phase 9+).

**Deliverables:**

- React pages + API wiring for all listed screens
- E2E smoke test using Playwright hitting the dev stack

**Acceptance criteria:**

- Every mutating action appears in `audit_logs` with `actor_id` = the admin JWT subject.
- Config JSON editor rejects invalid shapes before submission.

---

## Phase 9 — Webhooks, Fraud, Reporting

### PROMPT P9.1 — Outbound webhooks with retries

**Goal:** Deliver domain events back to tenant platforms (e.g. PSI) with signatures, retries, and dead-letter handling.

**Instructions to the coding agent:**

1. Tenant `webhook_config_json` lists endpoint URLs and subscribed `event_types`.
2. Worker consumes domain events (`RewardCreated`, `RewardApproved`, `PromoterStatusChanged`, `RefundReversed`, `WalletBalanceChanged`) and POSTs signed payloads to subscribed endpoints.
3. Signature header: `UPRM-Signature: t=<ts>,v1=<hex HMAC-SHA256 over ts.body>`. Retry with exponential backoff up to 24h; after that, move to dead letter and raise an admin alert.
4. Admin endpoint `GET /v1/webhooks/deliveries` returns status per delivery.

**Deliverables:**

- Webhook dispatcher worker, delivery log table, admin UI page

**Acceptance criteria:**

- A failing endpoint retries at least 6 times within 24h with growing delays.
- Tenants can replay a delivery from the admin UI.

---

### PROMPT P9.2 — Fraud signals & case workflow

**Goal:** Emit risk signals, open cases, and let fraud reviewers resolve them.

**Instructions to the coding agent:**

1. Signals: same IP multiple signups, same payment fingerprint, velocity (>N referrals/hour), self-referral attempt, high refund ratio in a cluster.
2. Signal scores are weighted per `fraud_config_json`; when a user's rolling score crosses the threshold, a `risk_cases` row is opened.
3. Opening a case flags in-flight `reward_decisions` for that user to `status=held` until resolution.
4. Resolution options: `allow` (release holds), `reject` (mark reversed), `escalate` (higher severity).

**Deliverables:**

- Fraud signal producers, case manager service, admin queue UI

**Acceptance criteria:**

- Holding a case prevents unlock of that user's pending rewards.
- Closing a case with `allow` releases all holds atomically.

---

### PROMPT P9.3 — Reporting & analytics read models

**Goal:** Produce daily read models for dashboards: conversion, reward ROI, tenant liability.

**Instructions to the coding agent:**

1. Nightly rollup jobs populate analytics tables: `conversion_daily`, `reward_performance_daily`, `tenant_liability_daily`, `cohort_retention_daily`.
2. Expose admin endpoints returning pre-aggregated series; the admin UI renders charts with recharts.
3. Keep raw `ledger_entries` untouched; analytics is a projection only.

**Deliverables:**

- Rollup jobs + admin dashboards

**Acceptance criteria:**

- Rebuilding analytics from ledger produces identical dashboards to the live projection.
- Dashboards load under 500ms on 90 days of data.

---

## Phase 10 — PSI Integration

Status note from live repo state: this is now the canonical next execution area, but it must be continued from current live UPRM reality rather than from a greenfield Phase 10 assumption. Phase 8, Phase 9.1, Phase 9.2, and Phase 9.3 have already been implemented in the live repo/runtime. The canonical continuation plan for remaining Phase 10 work is:

- `docs/plans/2026-04-25-phase-10-continuation-sdk-and-psi-cutover.md`

### PROMPT P10.1 — PSI-side UPRM client SDK

**Goal:** Build a thin TypeScript client used by the PSI backend to talk to UPRM.

**Instructions to the coding agent:**

1. Publish `packages/clients/uprm-client` exporting a `UprmClient` class configured with `baseUrl`, `apiKeyId`, `apiKeySecret`.
2. Methods: `createUser`, `linkTenantUser`, `createReferralCode`, `applyReferralCode`, `submitEvent` (typed per `event_type`), `getWallet`, `getPromoterStatus`.
3. Automatically adds HMAC signature, `idempotency_key` (client-side UUID), retries on 5xx with exponential backoff.
4. Ship a sample integration guide `docs/integration/psi.md`.

**Deliverables:**

- `uprm-client` package with TS types, unit tests, and integration guide

**Acceptance criteria:**

- A PSI-side integration test using the client passes the full signup-pay-refund lifecycle against a dev UPRM stack.
- Network flakiness (simulated 5xx) does not produce duplicate side effects thanks to `idempotency_key`.

---

### PROMPT P10.2 — Migrate PSI user & payment flows to UPRM

**Goal:** Switch PSI from its local user/payment/referral code to UPRM as the source of truth.

**Instructions to the coding agent:**

1. In PSI, reduce the local user schema to: `local_user_id`, `uprm_global_user_id`, `uprm_tenant_user_id`, `signed_up_platform`, and product-specific fields only.
2. All signup, login, payment, and referral flows call `UprmClient`. Stripe webhooks are forwarded (or re-pointed) to UPRM's Payment Hub.
3. Backfill existing PSI users into UPRM using a one-shot migration script: create `users` and `tenant_users` in UPRM, preserve referral edges.
4. Run PSI and UPRM in parallel-write mode for one release to validate consistency before cutting reads over to UPRM.

**Deliverables:**

- PSI migration scripts, dual-write wrappers, cutover checklist in `docs/migration/psi-cutover.md`

**Acceptance criteria:**

- Parallel-write reconciliation report shows zero drift between PSI and UPRM on all user, referral, and reward counts for one full week.
- After cutover, PSI contains no business logic for referral, wallet, or promoter computation.

---

# Part VII — Risks, Milestones & MVP Scope

## MVP scope (shippable, revenue-safe)

The following set is the minimum required to operate UPRM with PSI in production with real money:

- Phase 0 (foundation), Phase 1 (identity + tenancy), Phase 2 (referral graph)
- Phase 3 (event ingestion + Stripe Payment Hub)
- Phase 4 (ledger + wallet), Phase 5 (reward engine + unlock scheduler)
- Phase 6.1 (auto promoter qualification — manual applications can follow)
- **Phase 7 (refund reversal) — mandatory, not optional**
- Phase 8.1–8.2 (admin-api + essential screens)
- Phase 10.1 (client SDK) and a minimal Phase 10.2 cutover for PSI

## Complexity assessment

| Area                          | Complexity    | Notes                                                    |
| ----------------------------- | ------------- | -------------------------------------------------------- |
| L1/L2 reward logic            | Medium        | Straightforward once ancestry exists                     |
| Promoter thresholds & decay   | Medium        | Driven entirely by rule config                           |
| Wallet balances               | Medium        | Derived projection with a rebuild path                   |
| Immutable double-entry ledger | **High**      | Balance invariant + concurrency are the hard parts       |
| Refund reversal correctness   | **High**      | Three reversal paths; must handle partial refunds        |
| Fraud automation              | **High**      | Evolves continuously; start with signals + manual review |
| Cross-platform settlement     | **Very High** | Defer until a second tenant exists                       |

## Top risks and mitigations

- **Risk:** silent coupling between modules inside the monolith. **Mitigation:** enforce domain package boundaries via ESLint `import/no-restricted-paths` rules and review gates.
- **Risk:** event loss between DB commit and broker publish. **Mitigation:** transactional outbox from Phase 3, verified by chaos test.
- **Risk:** ledger drift under concurrency. **Mitigation:** balance-enforcing trigger, property tests, and a daily reconciliation job.
- **Risk:** credits treated as cash. **Mitigation:** explicitly scope credits as non-withdrawable platform units in Phase 1; document in ToS.
- **Risk:** PSI migration data loss. **Mitigation:** dual-write plus reconciliation report before cutover (Phase 10.2).

## Milestones (calendar-agnostic)

1. **M1 — Foundation ready:** monorepo, infra, tenants + identity working end-to-end on a dev stack (end of Phase 1).
2. **M2 — Events + ledger + L1/L2 rewards live** on staging with a seeded PSI tenant (end of Phase 5).
3. **M3 — Refund reversal and promoter auto-qualification** verified on staging (end of Phase 7).
4. **M4 — Admin backoffice** on `uprm.aquiero.com` with audit logs (end of Phase 8).
5. **M5 — PSI cut over to UPRM in production** after a parallel-write validation window (end of Phase 10).

---

> **One last rule** — Whenever the coding agent is tempted to let one module read another module's table directly — **stop**. That shortcut is precisely what makes externalisation expensive later. Route it through an interface, a domain event, or a read model. The small friction now buys the freedom to extract any module into its own deployment without a rewrite.
