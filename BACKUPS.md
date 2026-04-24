# UPRM Backups

## Scope

This project now includes a local rotating Postgres backup workflow for the live `uprm` database.

Backup script:

- `/srv/uprm/scripts/backup-postgres.sh`

Backup destination:

- `/var/backups/uprm/`

Latest symlink:

- `/var/backups/uprm/latest.sql.gz`

## Manual backup

```bash
sudo /srv/uprm/scripts/backup-postgres.sh
```

## Automated backup

Installed cron file:

- `/etc/cron.d/uprm-db-backup`

Current schedule:

- daily at 02:15 UTC
- retention: 14 days

## Restore

Warning: this will overwrite the target database contents.

```bash
gunzip -c /var/backups/uprm/latest.sql.gz | \
  sudo docker compose -f /srv/uprm/infra/docker/docker-compose.yml --env-file /srv/uprm/.env exec -T postgres \
    psql -U uprm -d uprm
```

To restore from a specific file:

```bash
gunzip -c /var/backups/uprm/uprm-postgres-YYYYMMDDTHHMMSSZ.sql.gz | \
  sudo docker compose -f /srv/uprm/infra/docker/docker-compose.yml --env-file /srv/uprm/.env exec -T postgres \
    psql -U uprm -d uprm
```

## Verification

List available backups:

```bash
ls -lh /var/backups/uprm/
```

Run an immediate backup test:

```bash
sudo /srv/uprm/scripts/backup-postgres.sh
```

## Future improvement

This closes the immediate P0 gap with local rotating backups only.
A future hardening step should ship these backups off-box/object storage so the VPS is not the only failure domain.
