export type PromoterBonusTierType = 'percent' | 'flat';

export interface PromoterBonusTier {
  depth: number;
  type: PromoterBonusTierType;
  value: string;
}

export interface PromoterTypeRecord {
  key: string;
  enabled: boolean;
  bonusTiers: PromoterBonusTier[];
}

export interface PromoterConfigRecord {
  enabled: boolean;
  types: PromoterTypeRecord[];
}

export interface PromoterTypeDraft extends PromoterTypeRecord {}

export interface PromoterConfigDraft {
  enabled: boolean;
  types: PromoterTypeDraft[];
}

export function toPromoterConfigDraft(raw: unknown): PromoterConfigDraft {
  const source = isRecord(raw) ? raw : {};
  const rawTypes = Array.isArray(source.types) ? source.types : [];

  return {
    enabled: source.enabled === true,
    types: rawTypes.filter(isRecord).map((typeRecord, index) => ({
      key: normalizeKey(typeRecord.key, `promoter_${index + 1}`),
      enabled: typeRecord.enabled !== false,
      bonusTiers: normalizeBonusTiers(typeRecord.bonusTiers),
    })),
  };
}

export function serializePromoterConfigDraft(draft: PromoterConfigDraft): PromoterConfigRecord {
  return {
    enabled: draft.enabled,
    types: draft.types.map((typeRecord) => ({
      key: normalizeKey(typeRecord.key, 'promoter'),
      enabled: typeRecord.enabled,
      bonusTiers: normalizeBonusTiers(typeRecord.bonusTiers),
    })),
  };
}

export function listSelectablePromoterTypes(raw: unknown): string[] {
  const draft = toPromoterConfigDraft(raw);
  if (!draft.enabled) {
    return ['promoter'];
  }

  const enabledTypes = draft.types
    .filter((typeRecord) => typeRecord.enabled)
    .map((typeRecord) => normalizeKey(typeRecord.key, ''))
    .filter((key) => key.length > 0);

  return enabledTypes.length > 0 ? enabledTypes : ['promoter'];
}

export function addPromoterType(draft: PromoterConfigDraft): PromoterConfigDraft {
  return {
    ...draft,
    types: [
      ...draft.types,
      {
        key: `promoter_${draft.types.length + 1}`,
        enabled: true,
        bonusTiers: [{ depth: 1, type: 'percent', value: '0' }],
      },
    ],
  };
}

export function updatePromoterType(
  draft: PromoterConfigDraft,
  targetKey: string,
  updates: Partial<Pick<PromoterTypeDraft, 'key'>>,
): PromoterConfigDraft {
  return {
    ...draft,
    types: draft.types.map((typeRecord) =>
      typeRecord.key === targetKey
        ? { ...typeRecord, ...(updates.key !== undefined ? { key: updates.key } : {}) }
        : typeRecord,
    ),
  };
}

export function deletePromoterType(
  draft: PromoterConfigDraft,
  targetKey: string,
): PromoterConfigDraft {
  return {
    ...draft,
    types: draft.types.filter((typeRecord) => typeRecord.key !== targetKey),
  };
}

export function setPromoterTypeEnabled(
  draft: PromoterConfigDraft,
  targetKey: string,
  enabled: boolean,
): PromoterConfigDraft {
  return {
    ...draft,
    types: draft.types.map((typeRecord) =>
      typeRecord.key === targetKey ? { ...typeRecord, enabled } : typeRecord,
    ),
  };
}

export function addPromoterTypeTier(
  draft: PromoterConfigDraft,
  targetKey: string,
): PromoterConfigDraft {
  return {
    ...draft,
    types: draft.types.map((typeRecord) =>
      typeRecord.key === targetKey
        ? {
            ...typeRecord,
            bonusTiers: [
              ...typeRecord.bonusTiers,
              {
                depth: typeRecord.bonusTiers.length + 1,
                type: 'percent',
                value: '0',
              },
            ],
          }
        : typeRecord,
    ),
  };
}

export function updatePromoterTypeTier(
  draft: PromoterConfigDraft,
  targetKey: string,
  depth: number,
  updates: Partial<Pick<PromoterBonusTier, 'type' | 'value'>>,
): PromoterConfigDraft {
  return {
    ...draft,
    types: draft.types.map((typeRecord) =>
      typeRecord.key === targetKey
        ? {
            ...typeRecord,
            bonusTiers: typeRecord.bonusTiers.map((tier) =>
              tier.depth === depth
                ? {
                    ...tier,
                    ...(updates.type ? { type: updates.type } : {}),
                    ...(updates.value !== undefined ? { value: updates.value } : {}),
                  }
                : tier,
            ),
          }
        : typeRecord,
    ),
  };
}

export function deletePromoterTypeTier(
  draft: PromoterConfigDraft,
  targetKey: string,
  depth: number,
): PromoterConfigDraft {
  return {
    ...draft,
    types: draft.types.map((typeRecord) =>
      typeRecord.key === targetKey
        ? {
            ...typeRecord,
            bonusTiers: reindexBonusTiers(
              typeRecord.bonusTiers.filter((tier) => tier.depth !== depth),
            ),
          }
        : typeRecord,
    ),
  };
}

function normalizeBonusTiers(raw: unknown): PromoterBonusTier[] {
  const rawTiers = Array.isArray(raw) ? raw : [];
  return reindexBonusTiers(
    rawTiers.filter(isRecord).map((tier) => ({
      depth: 1,
      type: tier.type === 'flat' ? 'flat' : 'percent',
      value: typeof tier.value === 'string' && tier.value.trim() ? tier.value : '0',
    })),
  );
}

function reindexBonusTiers(tiers: PromoterBonusTier[]): PromoterBonusTier[] {
  return tiers.map((tier, index) => ({ ...tier, depth: index + 1 }));
}

function normalizeKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
