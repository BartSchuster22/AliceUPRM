# Migrate UPRM to another server

This procedure preserves PostgreSQL state and deployment configuration while recreating application and infrastructure services from GitHub. It intentionally does **not** copy Docker volumes or assume RabbitMQ messages can be moved safely.

## Migration artifacts

GitHub provides public/reproducible artifacts:

- reviewed source revision;
- Prisma migrations;
- pinned Compose infrastructure;
- systemd and Caddy templates;
- install, backup, restore, and validation scripts;
- operator documentation.

A migration additionally requires restricted external artifacts:

- `/srv/uprm/.env` transferred through an encrypted channel;
- final PostgreSQL `.dump`, `.sha256`, and `.json` files;
- RabbitMQ definitions JSON and checksum if custom users/topology must be preserved;
- source commit and deployment hostname;
- optional Grafana dashboards or MinIO application data if those services become operational dependencies.

Never commit these private artifacts.

## Phase 1: Rehearse without production cutover

1. Provision the target using [INSTALL.md](INSTALL.md), but do not point public DNS at it.
2. Check out the exact reviewed commit intended for migration.
3. Securely copy the production `.env` and set mode `0600`.
4. Verify the source can safely freeze/drain before any rehearsal backup:

   ```bash
   sudo /srv/uprm/scripts/check-drain-state.sh \
     --env /srv/uprm/.env \
     --json
   ```

   A rehearsal may proceed with nonzero counts only if the operator explicitly records that it is not a final cutover artifact. A final cutover requires zero.

5. Create a rehearsal database backup on the source:

   ```bash
   sudo /srv/uprm/scripts/backup-postgres.sh \
     --env /srv/uprm/.env \
     --output-dir /var/backups/uprm-rehearsal
   ```

6. Export RabbitMQ definitions if custom topology/users must be preserved:

   ```bash
   sudo /srv/uprm/scripts/backup-rabbitmq-definitions.sh \
     --env /srv/uprm/.env \
     --output-dir /var/backups/uprm-rehearsal
   ```

7. Optionally create a single encrypted migration bundle containing the environment, database dump, sidecars, and broker definitions:

   ```bash
   sudo /srv/uprm/scripts/create-migration-bundle.sh \
     --env /srv/uprm/.env \
     --dump /var/backups/uprm-rehearsal/uprm-postgres-YYYYMMDDTHHMMSSZ.dump \
     --rabbitmq-definitions /var/backups/uprm-rehearsal/rabbitmq-definitions-YYYYMMDDTHHMMSSZ.json \
     --recipient age1... \
     --output /var/backups/uprm-rehearsal/uprm-migration.age
   ```

8. Transfer the encrypted bundle or individual dump/sidecar files over an encrypted authenticated channel.
6. Stop target application services before restore:

   ```bash
   sudo systemctl stop uprm-api-core uprm-admin-api uprm-worker
   ```

7. Restore only after verifying the target database name:

   ```bash
   sudo /srv/uprm/scripts/restore-postgres.sh \
     --env /srv/uprm/.env \
     --dump /secure/path/uprm-postgres-YYYYMMDDTHHMMSSZ.dump \
     --confirm-restore uprm
   ```

8. Deploy any migrations present in the target source revision, build, start services, and run every acceptance check from `INSTALL.md`.
9. Test administrative login, tenant HMAC authentication, user/balance reads, webhook signature verification with test payloads, worker consumption, and a controlled non-production reward flow.
10. Rehearse rollback before approving the real cutover.

## Phase 2: Prepare production cutover

Before the maintenance window:

- lower DNS TTL;
- confirm an off-host backup destination;
- confirm target disk capacity and time synchronization;
- verify target source is clean and at the approved commit;
- verify target environment permissions and checks;
- verify both servers can reach required external providers;
- communicate the write-freeze window;
- record current service, database, and queue health;
- retain the source server and all backups through the rollback window.

Record source revision:

```bash
cd /srv/uprm
git rev-parse HEAD
git status --porcelain
```

Do not cut over from a dirty working tree. Commit and review required changes first.

## Phase 3: Freeze writes and drain asynchronous work

Stop tenant and admin HTTP writes while keeping the worker available to drain already accepted events:

```bash
sudo systemctl stop uprm-api-core uprm-admin-api
```

Check the transactional outbox repeatedly:

```bash
sudo -u uprm bash -lc '
  set -a
  source /srv/uprm/.env
  set +a
  clean_url="${DATABASE_URL%%\?*}"
  psql "$clean_url" -Atc \
    "select count(*) from outbox_messages where \"publishedAt\" is null;"
'
```

Check RabbitMQ queues without purging them:

```bash
sudo docker exec uprm-rabbitmq-1 \
  rabbitmqctl list_queues -q name messages_ready messages_unacknowledged
```

Wait until unpublished outbox messages, ready messages, and unacknowledged messages are all zero. If they do not drain, abort cutover and diagnose; do not discard messages.

Stop the worker after drain:

```bash
sudo systemctl stop uprm-worker
```

From this point, keep all source UPRM application services stopped until cutover succeeds or rollback is initiated.

## Phase 4: Take final state artifacts

Create the final database backup:

```bash
sudo /srv/uprm/scripts/backup-postgres.sh \
  --env /srv/uprm/.env \
  --output-dir /var/backups/uprm-final
```

Export RabbitMQ definitions. Definitions include credential hashes and must be treated as secret:

```bash
sudo install -d -m 0700 /var/backups/uprm-final
sudo docker exec uprm-rabbitmq-1 \
  rabbitmqctl export_definitions - --format json \
  > /var/backups/uprm-final/rabbitmq-definitions.json
sudo chmod 0600 /var/backups/uprm-final/rabbitmq-definitions.json
cd /var/backups/uprm-final
sudo sha256sum rabbitmq-definitions.json \
  > rabbitmq-definitions.json.sha256
```

Copy `.env` without displaying it and encrypt all private artifacts before transfer. Verify checksums on the target before restore.

Do not rely on RabbitMQ definitions to preserve messages: cutover requires empty queues.

## Phase 5: Restore target

1. Verify target commit equals the recorded source/approved revision.
2. Validate target `.env`:

   ```bash
   sudo -u uprm /srv/uprm/scripts/validate-env.sh \
     --production /srv/uprm/.env
   ```

3. Start only container infrastructure.
4. Stop target application services.
5. Restore the final database dump with `restore-postgres.sh`.
6. If custom RabbitMQ definitions are needed, verify their checksum and import them before starting the worker:

   ```bash
   cd /secure/path
   sha256sum --check rabbitmq-definitions.json.sha256
   sudo docker cp rabbitmq-definitions.json \
     uprm-rabbitmq-1:/tmp/uprm-definitions.json
   sudo docker exec uprm-rabbitmq-1 \
     rabbitmqctl import_definitions /tmp/uprm-definitions.json
   sudo docker exec uprm-rabbitmq-1 rm -f /tmp/uprm-definitions.json
   ```

7. Ensure the configured RabbitMQ user has permissions for `/`; persisted definitions may represent an older credential state.
8. Run Prisma migration deployment and status.
9. Build from the frozen lockfile.
10. Start API Core, Admin API, and worker.

## Phase 6: Validate before DNS

Validate locally or through a temporary hosts-file entry:

- all containers running/healthy;
- all 15+ expected migrations applied, plus any newer reviewed migrations;
- systemd services active;
- ports 4000–4002 bound only to loopback;
- API Core root returns 200;
- Admin health endpoint returns 200;
- worker health and metrics return 200;
- admin login succeeds;
- representative tenant HMAC request succeeds;
- balances and latest financial records match source snapshots;
- RabbitMQ authentication and worker consumption succeed;
- Stripe and outbound-webhook secrets are present but never printed;
- public Caddy routing sends `/v1/*` to API Core and other paths to Admin API.

## Phase 7: DNS cutover and observation

1. Point DNS to the target.
2. Confirm Caddy has obtained a valid certificate.
3. Run public HTTPS checks from outside the target host.
4. Re-enable client writes.
5. Observe API errors, queue depth, outbox backlog, webhook delivery failures, and ledger/wallet activity throughout the rollback window.
6. Keep the source server stopped but intact. Do not run both workers against the same migrated logical state.

## Abort conditions

Abort or roll back if any of the following occurs:

- checksum mismatch;
- unapplied or failed migration;
- non-empty source queues at final backup;
- target worker cannot authenticate to RabbitMQ;
- failed tenant HMAC or admin authentication;
- balance/ledger reconciliation mismatch;
- Stripe webhook verification failures;
- unexplained error-rate or queue-backlog growth.

Follow [ROLLBACK.md](ROLLBACK.md). The source instance must not be deleted as part of migration automation.


## Rehearsal evidence

Use [`REHEARSAL_EVIDENCE_TEMPLATE.md`](REHEARSAL_EVIDENCE_TEMPLATE.md) for every migration rehearsal. A second operator should review it before final cutover or decommission approval.
