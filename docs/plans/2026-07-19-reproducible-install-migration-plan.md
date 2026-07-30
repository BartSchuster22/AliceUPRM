# Reproducible UPRM Installation and Migration Implementation Plan

> **For Hermes:** Implement this plan task-by-task. Preserve production data, never commit secrets, and use dry-run or temporary-directory tests before any live operation.

**Goal:** Make the GitHub repository plus an explicitly documented encrypted migration bundle sufficient to install a fresh UPRM server or migrate the current deployment with verifiable rollback.

**Architecture:** The repository becomes the source of truth for application code, pinned infrastructure, process-manager and reverse-proxy templates, installation scripts, backup/restore tooling, and operator runbooks. Secrets and production data remain outside GitHub in an encrypted migration bundle containing a PostgreSQL dump, broker definitions, environment file, source revision, checksums, and a manifest. Installation and restore are separate, fail-closed operations; verification is read-only.

**Tech stack:** Ubuntu 22.04+, Bash, Docker Engine/Compose, Node.js 20, Corepack/pnpm 10.33.0, PostgreSQL 16, RabbitMQ 3, Caddy 2, systemd, Prisma.

---

## Success criteria

A clean target server is considered reproducible only when all of the following are true:

1. A documented command installs host prerequisites and the `uprm` service account without embedding credentials.
2. Docker images use reviewed version pins rather than moving `latest` tags.
3. `.env.example` and an automated validator define every required configuration key and reject insecure placeholders, malformed URLs, wrong file permissions, and inconsistent broker/database credentials.
4. Versioned systemd and Caddy templates reproduce ports 4000/4001/4002 and route `/v1/*` to API Core while routing the remaining hostname to Admin API.
5. A source install performs frozen dependency installation, Prisma generation, migration deployment, build, service installation, and health verification.
6. A migration bundle records source commit, UTC timestamp, tool versions, PostgreSQL dump, RabbitMQ definitions, encrypted environment, checksums, and restoration instructions.
7. Restore tooling validates checksums before mutation and requires an explicit destructive confirmation.
8. A read-only verifier proves database migration status, Docker health, service readiness, API health, worker metrics, and public HTTPS routing.
9. Cutover and rollback runbooks include queue draining, write freeze, DNS/TLS, validation, rollback thresholds, and source-server retention.
10. Scripts have hermetic tests using temporary directories and fake commands; repository lint, typecheck, tests, build, and shell syntax checks pass.

## Safety invariants

- No production data is deleted by installation tooling.
- Restore defaults to refusal; destructive database restore requires `--confirm-restore` and a named target environment.
- `.env`, database dumps, RabbitMQ definitions containing credentials, and migration bundles are ignored by Git.
- Backups are written atomically, checksummed, and verified before being called successful.
- The old server is not decommissioned until the target passes acceptance checks and the rollback window expires.
- Queue messages are not assumed portable. Migrations freeze writes and drain outbox/consumer work before final backup.
- All scripts support `--help`; host-mutating scripts support `--dry-run` or a non-mutating `check` mode.

## Task 1: Establish the deployment contract

**Files:**
- Create: `docs/deployment/INSTALL.md`
- Create: `docs/deployment/MIGRATION.md`
- Create: `docs/deployment/ROLLBACK.md`
- Create: `docs/deployment/DECOMMISSION.md`
- Modify: `README.md`

**Steps:**
1. Record supported OS, CPU/RAM/disk expectations, ports, DNS, service user, filesystem layout, and exact runtime versions.
2. Separate fresh install, stateful migration, rollback, and final decommission procedures.
3. Define required external artifacts: encrypted `.env`, database dump, RabbitMQ definitions, and checksum manifest.
4. Add preflight, cutover, verification, rollback, and acceptance checklists.
5. Link every runbook from the root README.

**Verification:** Run the documentation command examples through shell syntax checks where possible and manually verify that no secret value appears in the diff.

## Task 2: Pin infrastructure and add health contracts

**Files:**
- Modify: `infra/docker/docker-compose.yml`
- Modify: `infra/docker/prometheus.yml`
- Create: `infra/docker/versions.env`

**Steps:**
1. Replace moving `latest` tags with tested version tags or immutable digests.
2. Add health checks for Redis, RabbitMQ, MinIO, Prometheus, Grafana, and Loki where supported.
3. Add explicit resource/logging defaults and restart behavior without changing exposed loopback ports.
4. Validate Compose with a placeholder environment file.

**Verification:** `docker compose --env-file .env.example config --quiet` using safe populated test values.

## Task 3: Make service definitions relocatable and reproducible

**Files:**
- Replace: `infra/systemd/uprm-api-core.service`
- Replace: `infra/systemd/uprm-admin-api.service`
- Replace: `infra/systemd/uprm-worker.service`
- Modify: `infra/systemd/README.md`
- Create: `infra/caddy/uprm.caddy.example`

**Steps:**
1. Remove the NVM patch-version path from units; invoke pnpm through `/usr/bin/env` with a controlled PATH.
2. Use `start:prod`, startup timeouts, restart limits, security hardening, and explicit service dependencies.
3. Add a checked Caddy template matching the live `/v1/*` routing contract.
4. Document template substitution for hostname and repository root.

**Verification:** `systemd-analyze verify` on all units and `caddy validate --config` on a temporary rendered Caddyfile.

## Task 4: Add environment validation using TDD

**Files:**
- Create: `scripts/lib/common.sh`
- Create: `scripts/validate-env.sh`
- Create: `scripts/tests/validate-env.test.sh`
- Modify: `.env.example`

**RED:** Tests must fail for missing keys, `CHANGE_ME` placeholders, malformed URLs, credential mismatches, and group/world-readable production env files.

**GREEN:** Implement a parser that never executes environment-file contents, emits key names but never values, supports `--example` and `--production`, and returns nonzero on invalid input.

**Verification:** `bash scripts/tests/validate-env.test.sh` and `bash -n` for all scripts.

## Task 5: Add a safe host preflight/bootstrap path

**Files:**
- Create: `scripts/preflight-host.sh`
- Create: `scripts/bootstrap-host.sh`
- Create: `scripts/tests/preflight-host.test.sh`

**RED:** Test unsupported OS, insufficient commands, occupied public ports, wrong repository ownership, and missing DNS prerequisites through injected/fake probes.

**GREEN:** Implement read-only `preflight-host.sh` and idempotent `bootstrap-host.sh --dry-run|--apply`. Bootstrap creates only the service user/directories and installs documented packages; it never writes `.env` or restores data.

**Verification:** Run preflight against the current host and bootstrap in dry-run mode.

## Task 6: Make PostgreSQL backup and restore deterministic

**Files:**
- Replace: `scripts/backup-postgres.sh`
- Create: `scripts/restore-postgres.sh`
- Create: `scripts/tests/postgres-backup-restore.test.sh`

**RED:** Tests cover use of configured database/user, atomic output, failed dump cleanup, checksum mismatch, refusal without confirmation, and safe command construction.

**GREEN:** Read configuration without executing `.env`; produce custom-format or compressed SQL dump plus SHA-256; validate before restore; require `--confirm-restore` and explicit target.

**Verification:** Create a non-production test database, dump it, restore to a second temporary database, and compare schema/migration state.

## Task 7: Capture RabbitMQ topology and drain state

**Files:**
- Create: `scripts/backup-rabbitmq-definitions.sh`
- Create: `scripts/restore-rabbitmq-definitions.sh`
- Create: `scripts/check-drain-state.sh`
- Create: `scripts/tests/rabbitmq-tools.test.sh`

**RED:** Tests cover malformed definitions, absent broker, non-empty queues/outbox, and refusal to declare cutover-ready.

**GREEN:** Export/import definitions without printing credentials; report queue counts and database outbox/scheduled/webhook work; exit nonzero until all cutover-sensitive work is drained.

**Verification:** Export current definitions read-only and validate the JSON; do not purge queues.

## Task 8: Build an encrypted migration bundle

**Files:**
- Create: `scripts/create-migration-bundle.sh`
- Create: `scripts/verify-migration-bundle.sh`
- Create: `scripts/templates/migration-manifest.json`
- Create: `scripts/tests/migration-bundle.test.sh`
- Modify: `.gitignore`

**RED:** Tests cover missing encryption recipient, incomplete artifacts, checksum tampering, accidental plaintext output, and source-commit mismatch.

**GREEN:** Bundle source revision, database dump/checksum, broker definitions, environment file, versions, and manifest; encrypt with `age`; write atomically; verify by decrypting into a permission-restricted temporary directory.

**Verification:** Build and verify a fixture bundle containing synthetic data only.

## Task 9: Automate source installation

**Files:**
- Create: `scripts/install-uprm.sh`
- Create: `scripts/tests/install-uprm.test.sh`

**RED:** Tests cover dirty source, wrong Node/pnpm versions, invalid env, missing Docker health, failed Prisma migration, failed build, and refused service install.

**GREEN:** Implement phased `check`, `prepare`, `migrate`, `build`, `install-services`, and `verify` commands. Every phase is idempotent and prints the exact failed step.

**Verification:** Run `check` against the current server and a full install against a disposable VM/container before target cutover.

## Task 10: Add a read-only acceptance verifier

**Files:**
- Create: `scripts/verify-installation.sh`
- Create: `scripts/tests/verify-installation.test.sh`

**RED:** Tests cover failed container health, unapplied migrations, absent listeners, unhealthy worker, public-route mismatch, and accidentally exposed infrastructure ports.

**GREEN:** Verify repository commit, Compose state, Prisma migration status, systemd services, loopback health, metrics, public HTTPS, and route behavior. Emit a concise machine-readable summary and human diagnostics.

**Verification:** Run against current production without mutations and save output outside Git.

## Task 11: Add CI and release checks

**Files:**
- Modify: `.github/workflows/quality.yml`
- Create: `.github/workflows/deployment-artifacts.yml`

**Steps:**
1. Add shell syntax/tests, Compose validation, systemd verification, and Caddy adaptation validation.
2. Keep application lint/typecheck/test/build checks.
3. On version tags, package only public deployment templates/scripts/docs; never package `.env` or data.

**Verification:** Reproduce workflow commands locally, then verify GitHub Actions on a pull request.

## Task 12: Rehearse migration and gate decommission

**Files:**
- Create: `docs/deployment/REHEARSAL_EVIDENCE_TEMPLATE.md`
- Modify: `docs/deployment/MIGRATION.md`
- Modify: `docs/deployment/DECOMMISSION.md`

**Steps:**
1. Provision a disposable target server from the repository.
2. Restore a fresh encrypted migration bundle.
3. Run the complete acceptance verifier and representative financial workflow tests.
4. Exercise rollback before DNS cutover.
5. Perform controlled write freeze, drain, final backup, restore, DNS cutover, and acceptance checks.
6. Retain the source server powered on but write-disabled for the agreed rollback window.
7. Decommission only after backup retrieval and explicit operator approval.

**Verification:** A second operator reviews and signs the rehearsal evidence; no source-server deletion is automated.

## Implementation order

Work begins with Tasks 1, 3, and 4 because they establish the deployment contract, remove host-specific service paths, and give every later script a safe configuration boundary. Backup/restore and migration-bundle work follows only after validation is tested. No live restore, DNS change, service replacement, or deletion is part of the initial implementation pass.
