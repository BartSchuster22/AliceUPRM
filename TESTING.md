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

## Stripe webhook verification (Phase 7)

Stripe verification should be done safely with test payloads and without mutating real production financial data.

### Recommended verification sequence

Run:

```bash
cd /srv/uprm
source /home/uprm/.nvm/nvm.sh
pnpm --filter @uprm/payments test
pnpm --filter @uprm/events test
pnpm --filter admin-api test -- stripe-webhooks.controller.spec.ts tenants.controller.spec.ts payouts.controller.spec.ts app.controller.spec.ts
pnpm --filter @uprm/payments build
pnpm --filter admin-api build
```

Expected:

- payments package tests pass
- events package tests pass
- admin-api targeted tests pass
- payments package builds cleanly
- admin-api builds cleanly

### What is covered by the current Phase 7 tests

Payments normalization:

- `checkout.session.completed` -> `subscription_started`
- `invoice.paid` -> `invoice_paid`
- `customer.subscription.deleted` -> `subscription_cancelled`
- `charge.refunded` -> `refund_issued`
- `charge.dispute.created` -> `chargeback_opened`
- `charge.dispute.closed` -> `chargeback_won` / `chargeback_lost`
- unsupported Stripe events are ignored cleanly

Admin webhook ingress:

- missing `stripe-signature` rejected
- missing tenant rejected
- disabled tenant Stripe config rejected
- normalized event ingested through `EventIngestionService`
- unmappable event returns `ignored: true`

Event linking:

- refund events create `refund_of` links when the prior event exists
- chargeback resolution events create `chargeback_resolution_of` links when the prior event exists

### Deployment-safe operator checks

After deployment, verify without using real refund/dispute actions:

1. configure tenant Stripe webhook settings through admin-api
2. restart `uprm-admin-api`
3. confirm the route exists:
   - `POST /admin/webhooks/stripe/:tenantId`
4. replay only test/synthetic Stripe payloads against the webhook endpoint
5. verify acceptance/duplicate/ignored behavior in responses and logs
6. inspect DB rows only if needed:
   - `ingested_events`
   - `outbox_messages`
   - `event_links`

### Do not do this

- do not trigger real production refunds just to smoke-test Phase 7
- do not trigger real disputes/chargebacks for testing
- do not rely on live tenant financial mutations when fixture-based verification is sufficient

## Expected behavior

- `pnpm test` -> runs workspace tests that should pass without DB-only environment setup
- `pnpm test:integration` -> runs the real-Postgres ledger suite only

## Notes

- If `DATABASE_URL` is missing, integration tests will fail at Prisma initialization.
- This split is intentional so feature work can use a reproducible default test path while keeping DB-backed verification available.
- The ledger integration suite now uses synthetic tenant/user IDs and must never point at live PSI IDs.
- App-level Jest tests for workspace packages may require the referenced package to be built first if the package `main` points at `dist/index.js`.
