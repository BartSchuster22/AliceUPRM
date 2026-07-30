# Install UPRM on a clean server

This runbook installs a **new, empty** UPRM deployment. To preserve tenants, balances, events, audit records, or configuration from another server, follow [MIGRATION.md](MIGRATION.md) instead.

## Supported baseline

| Component | Supported/tested value |
| --- | --- |
| OS | Ubuntu 22.04/24.04 LTS, `amd64` |
| Node.js | `v20.20.2` |
| pnpm | `10.33.0` (also declared in `package.json`) |
| Docker Engine | 29.x or compatible supported release |
| Docker Compose | v2+ plugin (`docker compose`) |
| Caddy | 2.11 or compatible Caddy 2 release |
| PostgreSQL | 16, pinned by digest in Compose |
| Repository path | `/srv/uprm` |
| Service account | `uprm` with home `/home/uprm` |

Minimum recommended target: 4 CPU, 8 GiB RAM, 80 GiB SSD plus separate backup capacity. Size production disk from the source database and monitoring-volume usage, not this minimum.

## Required network and DNS

Inbound:

- TCP 22 from administrative networks;
- TCP 80 and 443 from the Internet or trusted ingress.

The application and infrastructure ports bind only to loopback: 4000–4002, 5432, 5672, 6379, 9000–9001, 9090, 15672, 3001, and 3100. Do not expose them publicly.

Create the hostname's DNS A/AAAA record before starting Caddy. Automatic TLS cannot complete until DNS resolves to the target.

## 1. Preflight and install host prerequisites

Run the read-only preflight before installing anything:

```bash
/srv/uprm/scripts/preflight-host.sh \
  --repo /srv/uprm \
  --hostname uprm.example.com \
  --min-memory-mb 7800 \
  --min-disk-mb 20480
```

On a not-yet-cloned server, run the same script from a temporary checkout or from the deployment artifact archive. Then prepare the service account and base directories; review dry-run output first:

```bash
scripts/bootstrap-host.sh --repo /srv/uprm --dry-run
sudo scripts/bootstrap-host.sh --repo /srv/uprm --apply
```

Install Git, curl, xz, Python 3, Docker Engine with the Compose plugin, and Caddy from their official package repositories. Verify:

```bash
git --version
curl --version
docker --version
docker compose version
caddy version
python3 --version
systemctl --version
```

Install the tested Node distribution using its published checksum:

```bash
cd /tmp
curl -fLO https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz
printf '%s  %s\n' \
  'df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d' \
  'node-v20.20.2-linux-x64.tar.xz' | sha256sum --check
sudo tar -xJf node-v20.20.2-linux-x64.tar.xz -C /opt
sudo ln -sfn /opt/node-v20.20.2-linux-x64/bin/node /usr/local/bin/node
sudo ln -sfn /opt/node-v20.20.2-linux-x64/bin/corepack /usr/local/bin/corepack
sudo corepack enable --install-directory /usr/local/bin
sudo corepack prepare pnpm@10.33.0 --activate
node --version
pnpm --version
```

Expected versions are `v20.20.2` and `10.33.0`.

## 2. Create the service account and clone an immutable revision

```bash
sudo useradd --create-home --shell /bin/bash uprm
sudo install -d -o uprm -g uprm -m 0755 /srv/uprm
sudo -u uprm git clone git@github.com:BartSchuster22/AliceUPRM.git /srv/uprm
cd /srv/uprm
git fetch --tags origin
# Use the release tag or reviewed commit recorded in the migration manifest.
sudo -u uprm git checkout --detach <RELEASE_TAG_OR_COMMIT>
```

Do not deploy an uncommitted working tree. Record the selected revision:

```bash
git rev-parse HEAD
 git status --porcelain
```

The second command must print nothing.

## 3. Create and validate the environment

```bash
sudo -u uprm cp /srv/uprm/.env.example /srv/uprm/.env
sudo chmod 0600 /srv/uprm/.env
```

Populate every required value. Generate independent high-entropy application secrets, for example:

```bash
openssl rand -hex 32
```

Never reuse a database, RabbitMQ, JWT, bootstrap, or webhook secret. URL-encode credentials embedded in connection URLs. Ensure these component values agree:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` ↔ `DATABASE_URL`;
- `RABBITMQ_USER`, `RABBITMQ_PASSWORD` ↔ `RABBITMQ_URL`;
- `REDIS_PASSWORD` ↔ `REDIS_URL`.

Validate without printing values:

```bash
sudo -u uprm /srv/uprm/scripts/validate-env.sh --production /srv/uprm/.env
```

For a migration, use the securely transferred environment from the migration bundle rather than generating replacement integration secrets during cutover.

## 4. Install, generate, test, and build

```bash
cd /srv/uprm
sudo -u uprm pnpm install --frozen-lockfile
sudo -u uprm pnpm --filter @uprm/db db:generate
sudo -u uprm pnpm lint
sudo -u uprm pnpm typecheck
sudo -u uprm pnpm test
sudo -u uprm pnpm build
```

Do not continue if any quality gate fails.

## 5. Start pinned infrastructure and deploy the schema

```bash
cd /srv/uprm
sudo docker compose --env-file .env \
  --file infra/docker/docker-compose.yml pull
sudo docker compose --env-file .env \
  --file infra/docker/docker-compose.yml up --detach --wait
sudo -u uprm pnpm --filter @uprm/db db:migrate:deploy
sudo -u uprm pnpm --filter @uprm/db exec prisma migrate status \
  --schema packages/db/prisma/schema.prisma
```

Expected migration result: `Database schema is up to date`.

## 6. Install systemd and Caddy configuration

Review the exact targets without mutation:

```bash
cd /srv/uprm
sudo -u uprm scripts/install-system-files.sh \
  --repo /srv/uprm \
  --hostname uprm.example.com \
  --dry-run
```

Then install and start:

```bash
sudo scripts/install-system-files.sh \
  --repo /srv/uprm \
  --env /srv/uprm/.env \
  --hostname uprm.example.com \
  --apply --start
```

The installer validates systemd and Caddy before writing host files. It does not write or alter `.env`.

## 7. Acceptance checks

Run the read-only verifier first:

```bash
sudo /srv/uprm/scripts/verify-installation.sh \
  --repo /srv/uprm \
  --env /srv/uprm/.env \
  --hostname uprm.example.com
```

Then inspect the individual checks when troubleshooting:

```bash
systemctl is-active uprm-infrastructure uprm-api-core uprm-admin-api uprm-worker
curl --fail http://127.0.0.1:4000/
curl --fail http://127.0.0.1:4001/healthz
curl --fail http://127.0.0.1:4002/healthz
curl --fail http://127.0.0.1:4002/metrics >/dev/null
curl --fail https://uprm.example.com/
```

Also verify:

```bash
sudo docker compose --env-file /srv/uprm/.env \
  --file /srv/uprm/infra/docker/docker-compose.yml ps
journalctl -u uprm-api-core -u uprm-admin-api -u uprm-worker --since '10 minutes ago'
ss -ltn
```

Only ports 80/443 should be publicly bound. Confirm admin authentication, one read-only tenant integration request, Stripe webhook configuration, and worker metrics before accepting the installation.

## 8. First backup

```bash
sudo /srv/uprm/scripts/backup-postgres.sh \
  --env /srv/uprm/.env \
  --output-dir /var/backups/uprm
```

Copy the dump, checksum, and metadata to encrypted off-host storage. A backup remaining only on the application server is not disaster recovery.
