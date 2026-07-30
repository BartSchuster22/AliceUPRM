# UPRM migration rollback

Rollback restores service on the retained source server when target acceptance fails. It is safe only while the source state remains intact and there has not been uncontrolled dual-write activity.

## Before cutover

A rollback is straightforward before target writes are enabled:

1. Keep target APIs and worker stopped.
2. Restart source infrastructure if necessary.
3. Restart source worker, API Core, and Admin API.
4. Verify source local health.
5. Leave DNS unchanged or restore its previous record.

```bash
sudo systemctl start uprm-infrastructure
sudo systemctl start uprm-worker uprm-api-core uprm-admin-api
systemctl is-active uprm-worker uprm-api-core uprm-admin-api
curl --fail http://127.0.0.1:4000/
curl --fail http://127.0.0.1:4001/healthz
curl --fail http://127.0.0.1:4002/healthz
```

## After DNS cutover but before target writes

1. Stop target application services.
2. Restore DNS to the source address.
3. Start source services.
4. Verify public HTTPS after DNS/cache propagation.
5. Investigate the target offline.

## After target writes have occurred

Do **not** simply start the old source. Its database is now stale and can create duplicated events, ledger postings, payouts, or webhook deliveries.

Required response:

1. Immediately stop target API Core and Admin API to freeze writes.
2. Keep both workers stopped unless an incident lead explicitly selects one drain path.
3. Record the cutover time, first target write, latest source backup, and affected tenants/events.
4. Take a new target database backup before attempting repair.
5. Decide one authoritative database.
6. Reconcile target-only events, ledger entries, wallet reservations, payouts, outbox rows, and webhook deliveries.
7. Restore or promote only the selected authoritative database.
8. Start exactly one worker and one API deployment.
9. Run financial and queue reconciliation before reopening writes.

This is incident recovery, not an automated rollback. Escalate for database/application review.

## Rollback verification

After any rollback, verify:

- public DNS and TLS terminate at the intended source;
- exactly one set of UPRM application services is accepting traffic;
- exactly one worker is consuming UPRM queues;
- outbox and RabbitMQ queue depths converge;
- Prisma migration status is current for the running source revision;
- tenant authentication and admin login work;
- balances, recent postings, payout states, and webhook delivery states are coherent;
- target services remain disabled until a new migration attempt is approved.

Preserve both server logs and all migration artifacts for incident analysis.
