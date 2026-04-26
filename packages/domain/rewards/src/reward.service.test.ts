import { describe, it, expect } from 'vitest';
import { RewardService, type TriggerEvent, type Ancestor } from './reward.service';
import type { RewardConfig } from './config';

const svc = new RewardService();

function makeEvent(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    tenantId: 't1',
    eventId: 'evt-1',
    eventType: 'invoice_paid',
    occurredAt: new Date('2026-04-21T10:00:00Z'),
    referredTenantUserId: 'bob',
    amountMinor: 2999n, // €29.99 purchase value
    currency: 'EUR',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<RewardConfig> = {}): RewardConfig {
  return {
    enabled: true,
    currency: 'credit',
    settlementWindowDays: 7,
    triggers: ['invoice_paid', 'purchase_completed'],
    tiers: [
      { depth: 1, type: 'percent', value: '10' },
      { depth: 2, type: 'percent', value: '2' },
    ],
    ...overrides,
  };
}

describe('RewardService.computeRewards — happy path', () => {
  it('computes L1 and L2 rewards for a 2-deep chain', () => {
    const result = svc.computeRewards(makeEvent(), makeConfig(), [
      { tenantUserId: 'alice', depth: 1 },
      { tenantUserId: 'root', depth: 2 },
    ]);

    expect(result.eligible).toBe(true);
    expect(result.rewards).toHaveLength(2);

    const alice = result.rewards.find((r) => r.referrerTenantUserId === 'alice')!;
    expect(alice.depth).toBe(1);
    expect(alice.amountMinor).toBe(299n); // 10% of 2999 = 299.9, truncated to 299
    expect(alice.currency).toBe('credit');

    const root = result.rewards.find((r) => r.referrerTenantUserId === 'root')!;
    expect(root.depth).toBe(2);
    expect(root.amountMinor).toBe(59n); // 2% of 2999 = 59.98, truncated to 59
    expect(root.currency).toBe('credit');
  });

  it('sets postAt to occurredAt + settlementWindowDays', () => {
    const result = svc.computeRewards(makeEvent(), makeConfig({ settlementWindowDays: 7 }), [
      { tenantUserId: 'alice', depth: 1 },
    ]);
    expect(result.postAt).toEqual(new Date('2026-04-28T10:00:00Z'));
  });
});

describe('RewardService.computeRewards — percent math', () => {
  it('handles 10% cleanly on €100', () => {
    const result = svc.computeRewards(makeEvent({ amountMinor: 10_000n }), makeConfig(), [
      { tenantUserId: 'alice', depth: 1 },
    ]);
    expect(result.rewards[0]!.amountMinor).toBe(1000n); // 1000 credits minor units
  });

  it('handles fractional percents like 2.5%', () => {
    const result = svc.computeRewards(
      makeEvent({ amountMinor: 10_000n }),
      makeConfig({ tiers: [{ depth: 1, type: 'percent', value: '2.5' }] }),
      [{ tenantUserId: 'alice', depth: 1 }],
    );
    expect(result.rewards[0]!.amountMinor).toBe(250n);
  });

  it('handles very small percents like 0.075%', () => {
    const result = svc.computeRewards(
      makeEvent({ amountMinor: 1_000_000n }), // €10,000
      makeConfig({ tiers: [{ depth: 1, type: 'percent', value: '0.075' }] }),
      [{ tenantUserId: 'alice', depth: 1 }],
    );
    expect(result.rewards[0]!.amountMinor).toBe(750n);
  });
});

describe('RewardService.computeRewards — flat rewards', () => {
  it('pays a flat amount regardless of purchase size', () => {
    const result = svc.computeRewards(
      makeEvent({ amountMinor: 10_000n }),
      makeConfig({ tiers: [{ depth: 1, type: 'flat', value: '5.00' }] }),
      [{ tenantUserId: 'alice', depth: 1 }],
    );
    expect(result.rewards[0]!.amountMinor).toBe(500n);
  });
});

describe('RewardService.computeRewards — guards', () => {
  it('returns no rewards if config is disabled', () => {
    const result = svc.computeRewards(makeEvent(), makeConfig({ enabled: false }), [
      { tenantUserId: 'alice', depth: 1 },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('rewards_disabled');
    expect(result.rewards).toEqual([]);
  });

  it('returns no rewards for non-triggered event types', () => {
    const result = svc.computeRewards(makeEvent({ eventType: 'email_verified' }), makeConfig(), [
      { tenantUserId: 'alice', depth: 1 },
    ]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('event_type_not_triggered');
  });

  it('uses the configured reward currency even when the purchase event is fiat', () => {
    const result = svc.computeRewards(
      makeEvent({ currency: 'EUR' }),
      makeConfig({ currency: 'credit' }),
      [{ tenantUserId: 'alice', depth: 1 }],
    );
    expect(result.eligible).toBe(true);
    expect(result.rewards[0]!.currency).toBe('credit');
  });

  it('filters out self-referral ancestors (depth 0)', () => {
    const result = svc.computeRewards(makeEvent(), makeConfig(), [
      { tenantUserId: 'bob', depth: 0 }, // self — must be excluded
      { tenantUserId: 'alice', depth: 1 },
    ]);
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]!.referrerTenantUserId).toBe('alice');
  });

  it('skips ancestors whose depth has no configured tier', () => {
    const result = svc.computeRewards(
      makeEvent(),
      makeConfig({ tiers: [{ depth: 1, type: 'percent', value: '10', enabled: true }] as any }),
      [
        { tenantUserId: 'alice', depth: 1 },
        { tenantUserId: 'root', depth: 2 }, // no tier for depth 2
      ],
    );
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]!.referrerTenantUserId).toBe('alice');
  });

  it('skips disabled tiers but keeps enabled ones active', () => {
    const result = svc.computeRewards(
      makeEvent(),
      makeConfig({
        tiers: [
          { depth: 1, type: 'percent', value: '10', enabled: true },
          { depth: 2, type: 'percent', value: '2', enabled: false },
        ] as any,
      }),
      [
        { tenantUserId: 'alice', depth: 1 },
        { tenantUserId: 'root', depth: 2 },
      ],
    );
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]!.referrerTenantUserId).toBe('alice');
  });

  it('returns eligible=false when ancestry is empty', () => {
    const result = svc.computeRewards(makeEvent(), makeConfig(), []);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('no_eligible_ancestors');
    expect(result.rewards).toEqual([]);
  });
});

describe('parseRewardConfig', () => {
  it('accepts a valid config with fixed credit currency and explicit tier enabled flags', async () => {
    const { parseRewardConfig } = await import('./config');
    const cfg = parseRewardConfig({
      enabled: true,
      currency: 'credit',
      settlementWindowDays: 7,
      triggers: ['invoice_paid'],
      tiers: [{ depth: 1, type: 'percent', value: '10', enabled: true }],
    });
    expect(cfg.currency).toBe('credit');
    expect(cfg.tiers).toHaveLength(1);
    expect(cfg.tiers[0]?.enabled).toBe(true);
  });

  it('rejects invalid tier values', async () => {
    const { parseRewardConfig, RewardConfigError } = await import('./config');
    expect(() =>
      parseRewardConfig({
        enabled: true,
        currency: 'credit',
        settlementWindowDays: 7,
        triggers: ['invoice_paid'],
        tiers: [{ depth: 1, type: 'percent', value: 'banana' }],
      }),
    ).toThrow(RewardConfigError);
  });
});
