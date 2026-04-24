# UPRM systemd units

Three services manage the UPRM process tree:

| Service        | Port | Description                              |
| -------------- | ---- | ---------------------------------------- |
| uprm-api-core  | 4000 | Tenant-facing HMAC-guarded API           |
| uprm-admin-api | 4001 | Bootstrap-token admin API                |
| uprm-worker    | 4002 | Outbox relay + reward consumer/scheduler |

## Install on a fresh VPS

    sudo cp /srv/uprm/infra/systemd/*.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable uprm-api-core uprm-admin-api uprm-worker
    sudo systemctl start  uprm-api-core uprm-admin-api uprm-worker

## Daily ops

Status:

    sudo systemctl status uprm-api-core
    sudo systemctl list-units 'uprm-*'

Logs:

    journalctl -u uprm-api-core -f
    journalctl -u uprm-worker --since '10 min ago'

Restart after a code change:

    cd /srv/uprm && pnpm --filter api-core build
    sudo systemctl restart uprm-api-core

## Notes

- Services run `pnpm run start` which invokes `nest start`. Tech debt: running `node dist/main.js` directly would be leaner but requires `shamefully-hoist=true` in pnpm config.
- `EnvironmentFile=/srv/uprm/.env` loads secrets. The `.env` file must be present and readable by user `uprm`.
- `Requires=docker.service` means Postgres and RabbitMQ containers start before these services.
