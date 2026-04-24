import { describe, expect, it } from 'vitest';
import { createWebhookSignature } from './signing';

describe('createWebhookSignature', () => {
  it('returns deterministic signature output for a fixed timestamp', () => {
    const result = createWebhookSignature(
      'supersecret',
      {
        eventType: 'reward.created',
        tenantId: 'tenant-1',
        payload: { amountMinor: '1000', currency: 'EUR' },
      },
      1_700_000_000,
    );

    expect(result.payloadJson).toBe(
      JSON.stringify({
        eventType: 'reward.created',
        tenantId: 'tenant-1',
        payload: { amountMinor: '1000', currency: 'EUR' },
      }),
    );
    expect(result.digest).toBe('9039c3fd154b9c88f33d512ccd2997781448dc26345d90c952a19609b1018c9c');
    expect(result.header).toBe(
      't=1700000000,v1=9039c3fd154b9c88f33d512ccd2997781448dc26345d90c952a19609b1018c9c',
    );
  });
});
