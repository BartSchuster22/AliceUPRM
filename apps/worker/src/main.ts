import 'dotenv/config';
import * as http from 'node:http';
import { OutboxRelayService, RabbitPublisher } from '@uprm/outbox';

async function main() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL not set');

  const publisher = new RabbitPublisher(url);
  await publisher.connect();
  // eslint-disable-next-line no-console
  console.log('[worker] connected to RabbitMQ');

  const relay = new OutboxRelayService(publisher);

  // Tiny status endpoint for liveness and metrics.
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

  // Enter the relay loop — runs forever.
  await relay.startLoop({ intervalMs: 1000, batchSize: 50, maxAttempts: 10 });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[worker] fatal:', e);
  process.exit(1);
});
