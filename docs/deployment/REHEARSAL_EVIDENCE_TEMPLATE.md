# UPRM migration rehearsal evidence template

Use this template for every clean-server reinstall or migration rehearsal. Store the completed copy outside Git if it contains hostnames, private paths, screenshots, or operational identifiers.

## Rehearsal identity

| Field | Value |
| --- | --- |
| Date/time UTC |  |
| Source server |  |
| Target server |  |
| Operator |  |
| Reviewer |  |
| Approved Git commit/tag |  |
| Migration bundle path/checksum |  |
| Rollback backup path/checksum |  |

## Preflight evidence

- [ ] `scripts/preflight-host.sh --hostname <host> --repo /srv/uprm --require-dns` passed or documented DNS exception.
- [ ] Target OS, disk, memory, time sync, firewall, Docker, Caddy, Node, and pnpm versions recorded.
- [ ] Source tree was clean or dirty state was explicitly rejected before final cutover.

## Install evidence

- [ ] `scripts/install-uprm.sh check` passed.
- [ ] Dependencies installed with `pnpm install --frozen-lockfile`.
- [ ] Prisma client generation succeeded.
- [ ] Docker Compose config validated.
- [ ] Systemd and Caddy templates validated and installed.

## Restore and migration evidence

- [ ] PostgreSQL dump checksum verified before restore.
- [ ] Restore required `--confirm-restore <POSTGRES_DB>`.
- [ ] RabbitMQ definitions checksum verified/imported if applicable.
- [ ] Prisma `migrate deploy` and `migrate status` passed.
- [ ] Drain check returned zero before final source backup.

## Acceptance evidence

- [ ] `scripts/verify-installation.sh --hostname <host>` passed.
- [ ] Admin login verified.
- [ ] Tenant HMAC request verified.
- [ ] Worker `/healthz` and `/metrics` verified.
- [ ] RabbitMQ authentication and queue consumption verified.
- [ ] Stripe webhook test payload verified without real financial mutation.
- [ ] Balance/ledger source-vs-target spot checks matched.
- [ ] Public `/v1/*` routes to API Core; other routes route to Admin API.

## Rollback rehearsal

- [ ] Rollback trigger conditions reviewed.
- [ ] DNS rollback or hosts-file rollback tested before production cutover.
- [ ] Source server retained stopped/intact through rollback window.
- [ ] Do not decommission gate remains closed until reviewer signs off.

## Reviewer decision

- [ ] Approved for production cutover.
- [ ] Rejected; blockers listed below.

Blockers / notes:

```text

```
