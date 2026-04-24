import { describe, expect, it, vi } from 'vitest';
import { WebhookDeliveryService } from './delivery.service';

describe('WebhookDeliveryService', () => {
  it('returns only subscribed outbound endpoints for an event type', async () => {
    const db: any = {
      tenantConfig: {
        findUnique: vi.fn().mockResolvedValue({
          webhookConfig: {
            outbound: {
              enabled: true,
              endpoints: [
                {
                  id: 'psi-primary',
                  url: 'https://psi.internal/uprm/webhooks',
                  secret: 'supersecret1',
                  eventTypes: ['reward.created', 'wallet.balance.changed'],
                },
                {
                  id: 'psi-refunds',
                  url: 'https://psi.internal/uprm/refunds',
                  secret: 'supersecret2',
                  eventTypes: ['refund.reversed'],
                },
              ],
            },
          },
        }),
      },
    };

    const svc = new WebhookDeliveryService(db);
    const endpoints = await svc.getSubscribedEndpoints('tenant-1', 'reward.created');

    expect(endpoints).toEqual([
      {
        id: 'psi-primary',
        url: 'https://psi.internal/uprm/webhooks',
        secret: 'supersecret1',
        eventTypes: ['reward.created', 'wallet.balance.changed'],
      },
    ]);
  });
});
