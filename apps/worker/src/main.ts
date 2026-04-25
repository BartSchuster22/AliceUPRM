import 'dotenv/config';
import * as http from 'node:http';
import { OutboxRelayService, RabbitPublisher } from '@uprm/outbox';
import { RewardConsumer } from './rewards/reward-consumer';
import { RewardScheduler } from './rewards/scheduler';
import { ReportingRollupRunner } from './reporting/reporting-rollup';
import { WebhookDispatcher } from './webhooks/webhook-dispatcher';

async function main() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL not set');

  // Outbox relay — publishes outbox_messages to RabbitMQ
  const publisher = new RabbitPublisher(url);
  await publisher.connect();
  console.log('[worker] outbox publisher connected to RabbitMQ');
  const relay = new OutboxRelayService(publisher);

  // Reward consumer — subscribes to uprm.events.*, schedules rewards
  const consumer = new RewardConsumer(url);
  await consumer.start();

  // Reward scheduler — polls scheduled_postings, posts due ones
  const scheduler = new RewardScheduler();

  // Outbound webhook dispatcher — polls webhook_deliveries and delivers signed callbacks
  const webhooks = new WebhookDispatcher();

  // Reporting rollups — rebuild analytics read models for admin dashboards
  const reporting = new ReportingRollupRunner();

  // Metrics + healthz endpoint
  const port = Number(process.env.PORT) || 4002;
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(
        [
          `# TYPE uprm_outbox_dispatched_total counter`,
          `uprm_outbox_dispatched_total ${relay.metrics.dispatched}`,
          `# TYPE uprm_outbox_failed_total counter`,
          `uprm_outbox_failed_total ${relay.metrics.failed}`,
          `# TYPE uprm_outbox_batches_total counter`,
          `uprm_outbox_batches_total ${relay.metrics.batchesProcessed}`,
          `# TYPE uprm_rewards_consumed_total counter`,
          `uprm_rewards_consumed_total ${consumer.metrics.consumed}`,
          `# TYPE uprm_rewards_scheduled_total counter`,
          `uprm_rewards_scheduled_total ${consumer.metrics.scheduled}`,
          `# TYPE uprm_rewards_skipped_total counter`,
          `uprm_rewards_skipped_total ${consumer.metrics.skipped}`,
          `# TYPE uprm_rewards_errored_total counter`,
          `uprm_rewards_errored_total ${consumer.metrics.errored}`,
          `# TYPE uprm_rewards_posted_total counter`,
          `uprm_rewards_posted_total ${scheduler.metrics.posted}`,
          `# TYPE uprm_rewards_scheduler_batches_total counter`,
          `uprm_rewards_scheduler_batches_total ${scheduler.metrics.batches}`,
          `# TYPE uprm_webhooks_delivered_total counter`,
          `uprm_webhooks_delivered_total ${webhooks.metrics.delivered}`,
          `# TYPE uprm_webhooks_failed_total counter`,
          `uprm_webhooks_failed_total ${webhooks.metrics.failed}`,
          `# TYPE uprm_webhooks_dead_letter_total counter`,
          `uprm_webhooks_dead_letter_total ${webhooks.metrics.deadLetter}`,
          `# TYPE uprm_webhooks_replayed_total counter`,
          `uprm_webhooks_replayed_total ${webhooks.metrics.replayed}`,
          `# TYPE uprm_webhooks_batches_total counter`,
          `uprm_webhooks_batches_total ${webhooks.metrics.batches}`,
          `# TYPE uprm_reporting_rollups_total counter`,
          `uprm_reporting_rollups_total ${reporting.metrics.rollups}`,
          `# TYPE uprm_reporting_rollup_failures_total counter`,
          `uprm_reporting_rollup_failures_total ${reporting.metrics.failures}`,
          `# TYPE uprm_reporting_last_success_unixtime gauge`,
          `uprm_reporting_last_success_unixtime ${reporting.metrics.lastSuccessUnix}`,
        ].join('\n') + '\n',
      );
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[worker] status endpoint http://127.0.0.1:${port}`);
  });

  const shutdown = async (sig: string) => {
    console.log(`[worker] received ${sig}, stopping…`);
    relay.stop();
    scheduler.stop();
    webhooks.stop();
    reporting.stop();
    try {
      await consumer.stop();
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
    try {
      await publisher.close();
    } catch {}
    try {
      server.close();
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Kick off the two loops in parallel and never return.
  await Promise.all([
    relay.startLoop({ intervalMs: 1000, batchSize: 50, maxAttempts: 10 }),
    scheduler.startLoop(10_000),
    webhooks.startLoop(5_000),
    reporting.startLoop(),
  ]);
}

main().catch((e) => {
  console.error('[worker] fatal:', e);
  process.exit(1);
});
