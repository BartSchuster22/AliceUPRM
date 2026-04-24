import { createHmac } from 'node:crypto';
import type { WebhookSignature } from './types';

export function createWebhookSignature(
  secret: string,
  payload: unknown,
  timestamp = Math.floor(Date.now() / 1000),
): WebhookSignature {
  const payloadJson = JSON.stringify(payload);
  const signed = `${timestamp}.${payloadJson}`;
  const digest = createHmac('sha256', secret).update(signed).digest('hex');

  return {
    timestamp,
    payloadJson,
    digest,
    header: `t=${timestamp},v1=${digest}`,
  };
}
