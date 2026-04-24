# UPRM Testing

## Default test command

Use this for normal verification:

```bash
pnpm test
```

This is intentionally unit-safe and does not require `DATABASE_URL`.

Equivalent explicit command:

```bash
pnpm test:unit
```

## Integration tests

Ledger integration tests require a real Postgres connection via `DATABASE_URL`.

Run them explicitly:

```bash
set -a; source /srv/uprm/.env; set +a
pnpm test:integration
```

Or package-local:

```bash
cd /srv/uprm/packages/domain/ledger
set -a; source /srv/uprm/.env; set +a
pnpm test:integration
```

## Expected behavior

- `pnpm test` → runs workspace tests that should pass without DB-only environment setup
- `pnpm test:integration` → runs the real-Postgres ledger suite only

## Notes

- If `DATABASE_URL` is missing, integration tests will fail at Prisma initialization.
- This split is intentional so feature work can use a reproducible default test path while keeping DB-backed verification available.
- The ledger integration suite now uses synthetic tenant/user IDs and must never point at live PSI IDs.
