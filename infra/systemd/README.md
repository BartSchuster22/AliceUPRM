# UPRM systemd units

Versioned units reproduce the UPRM process tree at `/srv/uprm`:

| Service | Port | Responsibility |
| --- | ---: | --- |
| `uprm-infrastructure` | — | Starts pinned Docker Compose services and waits for health. |
| `uprm-api-core` | 4000 | Tenant-facing HMAC API. |
| `uprm-admin-api` | 4001 | Admin API and built web console. |
| `uprm-worker` | 4002 | Outbox, rewards, schedules, webhooks, qualification, reporting. |

The application units use system-installed Node/pnpm through `/usr/bin/env`, run production builds, validate `.env` before startup, and depend on the infrastructure unit. Secrets remain in `/srv/uprm/.env` with mode `0600`; they are not embedded in unit files.

## Validate and install

Use the repository installer rather than copying individual files:

```bash
cd /srv/uprm
scripts/install-system-files.sh \
  --repo /srv/uprm \
  --hostname uprm.example.com \
  --dry-run
sudo scripts/install-system-files.sh \
  --repo /srv/uprm \
  --env /srv/uprm/.env \
  --hostname uprm.example.com \
  --apply --start
```

See [`docs/deployment/INSTALL.md`](../../docs/deployment/INSTALL.md) for the complete host procedure.

## Operations

```bash
systemctl status uprm-infrastructure uprm-api-core uprm-admin-api uprm-worker
journalctl -u uprm-worker --since '10 minutes ago'
sudo systemctl restart uprm-api-core uprm-admin-api uprm-worker
```

Build and migrate before restarting after a source change. Do not use systemd service activity alone as readiness proof; verify ports and HTTP health endpoints.
