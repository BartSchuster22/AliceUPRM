import { describe, expect, it } from 'vitest';
import {
  addPromoterType,
  addPromoterTypeTier,
  deletePromoterType,
  serializePromoterConfigDraft,
  setPromoterTypeEnabled,
  toPromoterConfigDraft,
  updatePromoterType,
  updatePromoterTypeTier,
} from './promoter-config';

describe('promoter-config helpers', () => {
  it('normalizes raw promoter config into visual draft state', () => {
    const draft = toPromoterConfigDraft({
      enabled: true,
      types: [
        {
          key: 'promoter',
          enabled: true,
          bonusTiers: [
            { depth: 1, type: 'percent', value: '5' },
            { depth: 2, type: 'percent', value: '1' },
          ],
        },
      ],
    });

    expect(draft.types).toEqual([
      {
        key: 'promoter',
        enabled: true,
        bonusTiers: [
          { depth: 1, type: 'percent', value: '5' },
          { depth: 2, type: 'percent', value: '1' },
        ],
      },
    ]);
  });

  it('adds a promoter type with a default bonus tier', () => {
    const next = addPromoterType(toPromoterConfigDraft({ enabled: false, types: [] }));
    expect(next.types).toHaveLength(1);
    expect(next.types[0]).toEqual({
      key: 'promoter_1',
      enabled: true,
      bonusTiers: [{ depth: 1, type: 'percent', value: '0' }],
    });
  });

  it('adds a deeper bonus tier below the last depth for a promoter type', () => {
    const base = toPromoterConfigDraft({
      enabled: true,
      types: [
        { key: 'promoter', enabled: true, bonusTiers: [{ depth: 1, type: 'percent', value: '5' }] },
      ],
    });
    const next = addPromoterTypeTier(base, 'promoter');
    expect(next.types[0]?.bonusTiers.at(-1)).toEqual({ depth: 2, type: 'percent', value: '0' });
  });

  it('serializes disabled promoter types as disabled while preserving nested tiers', () => {
    const base = toPromoterConfigDraft({
      enabled: true,
      types: [
        { key: 'promoter', enabled: true, bonusTiers: [{ depth: 1, type: 'percent', value: '5' }] },
      ],
    });
    const next = setPromoterTypeEnabled(base, 'promoter', false);
    expect(serializePromoterConfigDraft(next).types).toEqual([
      {
        key: 'promoter',
        enabled: false,
        bonusTiers: [{ depth: 1, type: 'percent', value: '5' }],
      },
    ]);
  });

  it('updates and deletes promoter types predictably', () => {
    const base = toPromoterConfigDraft({
      enabled: true,
      types: [
        { key: 'promoter', enabled: true, bonusTiers: [{ depth: 1, type: 'percent', value: '5' }] },
        {
          key: 'vip_promoter',
          enabled: true,
          bonusTiers: [{ depth: 1, type: 'flat', value: '10' }],
        },
      ],
    });

    const edited = updatePromoterTypeTier(
      updatePromoterType(base, 'vip_promoter', { key: 'elite_promoter' }),
      'elite_promoter',
      1,
      { value: '12.5' },
    );
    const next = deletePromoterType(edited, 'promoter');

    expect(next.types).toEqual([
      {
        key: 'elite_promoter',
        enabled: true,
        bonusTiers: [{ depth: 1, type: 'flat', value: '12.5' }],
      },
    ]);
  });
});
