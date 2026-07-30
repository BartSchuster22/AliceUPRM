# Decommission the former UPRM server

Decommission is a separate, explicitly approved operation. None of the install, backup, restore, or migration scripts deletes the former server.

## Mandatory gates

Do not decommission until all gates are checked:

- [ ] The target was installed from a reviewed GitHub commit or release tag.
- [ ] The final database backup, checksum, metadata, environment, and broker definitions are stored in encrypted off-host storage.
- [ ] A restore rehearsal succeeded on a separate target.
- [ ] Target database migrations are current.
- [ ] APIs, worker, admin login, tenant HMAC, Stripe webhooks, and outbound webhooks passed acceptance.
- [ ] Financial reconciliation covered balances, ledger entries, wallet reservations, payouts, and settlements.
- [ ] Queue/outbox monitoring remained healthy through the agreed rollback window.
- [ ] DNS and TLS are stable at the target.
- [ ] No clients or integrations still use the former IP address.
- [ ] A human operator explicitly approved decommission.

## Recommended rollback window

Keep the former server powered on but with UPRM application services disabled for at least seven days, or longer when payment/referral settlement cycles require it. Restrict network access and continue host monitoring during retention.

```bash
sudo systemctl disable --now uprm-api-core uprm-admin-api uprm-worker
```

Do not remove Docker volumes or `/srv/uprm` during the rollback window.

## Final evidence collection

Before deletion, collect and verify:

- final source commit and Git status;
- final PostgreSQL backup plus SHA-256 and metadata;
- final broker definitions plus SHA-256;
- encrypted environment/configuration backup;
- systemd and Caddy configuration snapshots;
- migration acceptance report;
- target backup made after cutover;
- rollback-window monitoring summary.

Test decryption and checksum verification from a separate host. A file that has never been decrypted and inspected is not a proven backup.

## Destructive removal

The exact cloud/VPS deletion action is intentionally not automated in this repository. After approval:

1. Take one final target backup.
2. Confirm the former host identity/IP in the provider console.
3. Revoke source-host SSH/deploy credentials and any machine-specific monitoring tokens.
4. Delete or securely wipe the former instance through the infrastructure provider.
5. Remove obsolete DNS records and firewall entries.
6. Retain encrypted backups according to financial/legal retention policy.
7. Record who approved and performed deletion, when, and which backup identifiers were verified.

Never revoke tenant API keys, Stripe secrets, or webhook secrets merely because the host moved; rotate them through a coordinated integration change if exposure is suspected.
