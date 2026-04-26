import { describe, expect, it } from 'vitest';
import {
  addTier,
  deleteTier,
  serializeRewardConfigDraft,
  setTierEnabled,
  toRewardConfigDraft,
  updateTier,
} from './reward-config';

describe('reward-config helpers', () => {
  it('normalizes raw reward config into visual draft state', () => {
    const draft = toRewardConfigDraft({
      enabled: true,
      currency: 'EUR',
      settlementWindowDays: 7,
      triggers: ['invoice_paid'],
      tiers: [
        { depth: 1, type: 'percent', value: '10', enabled: true },
        { depth: 2, type: 'flat', value: '5', enabled: false },
      ],
    });

    expect(draft.currency).toBe('credit');
    expect(draft.tiers).toEqual([
      { depth: 1, type: 'percent', value: '10', enabled: true },
      { depth: 2, type: 'flat', value: '5', enabled: false },
    ]);
  });

  it('adds a new tier below the last depth', () => {
    const base = toRewardConfigDraft({
      enabled: true,
      currency: 'credit',
      settlementWindowDays: 7,
      triggers: ['invoice_paid'],
      tiers: [{ depth: 1, type: 'percent', value: '10' }],
    });

    const next = addTier(base);
    expect(next.tiers.at(-1)).toEqual({
      depth: 2,
      type: 'percent',
      value: '0',
      enabled: true,
    });
  });

  it('disabling a tier keeps it in serialized output with enabled=false so it can be re-enabled later', () => {
    const base = toRewardConfigDraft({
      enabled: true,
      currency: 'credit',
      settlementWindowDays: 7,
      triggers: ['invoice_paid'],
      tiers: [
        { depth: 1, type: 'percent', value: '10', enabled: true },
        { depth: 2, type: 'percent', value: '2', enabled: true },
        { depth: 3, type: 'flat', value: '1', enabled: true },
      ],
    });

    const next = setTierEnabled(base, 2, false);
    expect(next.tiers[1]?.enabled).toBe(false);
    expect(next.tiers[2]?.enabled).toBe(false);

    expect(serializeRewardConfigDraft(next).tiers).toEqual([
      { depth: 1, type: 'percent', value: '10', enabled: true },
      { depth: 2, type: 'percent', value: '2', enabled: false },
      { depth: 3, type: 'flat', value: '1', enabled: false },
    ]);
  });

  it('always serializes fixed credit currency', () => {
    const base = toRewardConfigDraft({
      enabled: true,
      currency: 'EUR',
      settlementWindowDays: 7,
      triggers: ['invoice_paid'],
      tiers: [{ depth: 1, type: 'percent', value: '10' }],
    });

    expect(serializeRewardConfigDraft(base).currency).toBe('credit');
  });

  it('reindexes tiers after delete and preserves edited values', () => {
    const base = toRewardConfigDraft({
      enabled: true,
      currency: 'credit',
      settlementWindowDays: 7,
      triggers: ['invoice_paid'],
      tiers: [
        { depth: 1, type: 'percent', value: '10' },
        { depth: 2, type: 'percent', value: '2' },
        { depth: 3, type: 'flat', value: '1' },
      ],
    });

    const edited = updateTier(base, 3, { value: '9.5' });
    const next = deleteTier(edited, 2);

    expect(next.tiers).toEqual([
      { depth: 1, type: 'percent', value: '10', enabled: true },
      { depth: 2, type: 'flat', value: '9.5', enabled: true },
    ]);
  });
});
