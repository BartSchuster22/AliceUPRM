export type RewardTierType = 'percent' | 'flat';

export interface RewardConfigTier {
  depth: number;
  type: RewardTierType;
  value: string;
  enabled: boolean;
}

export interface RewardConfigRecord {
  enabled: boolean;
  currency: 'credit';
  settlementWindowDays: number;
  triggers: string[];
  tiers: RewardConfigTier[];
}

export interface RewardTierDraft extends RewardConfigTier {
  enabled: boolean;
}

export interface RewardConfigDraft {
  enabled: boolean;
  currency: 'credit';
  settlementWindowDays: number;
  triggers: string[];
  tiers: RewardTierDraft[];
}

export const FIXED_REWARD_CURRENCY = 'credit';
export const DEFAULT_REWARD_TRIGGERS = [
  'invoice_paid',
  'subscription_paid',
  'purchase_completed',
] as const;
export const DEFAULT_SETTLEMENT_WINDOW_DAYS = 7;

export function toRewardConfigDraft(raw: unknown): RewardConfigDraft {
  const source = isRecord(raw) ? raw : {};
  const rawTiers = Array.isArray(source.tiers) ? source.tiers : [];

  const tiers = rawTiers.filter(isRecord).map((tier, index) => ({
    depth: index + 1,
    type: tier.type === 'flat' ? 'flat' : 'percent',
    value: typeof tier.value === 'string' && tier.value.trim() ? tier.value : '0',
    enabled: tier.enabled !== false,
  }));

  return {
    enabled: source.enabled === true,
    currency: FIXED_REWARD_CURRENCY,
    settlementWindowDays: normalizeSettlementWindowDays(source.settlementWindowDays),
    triggers: normalizeTriggers(source.triggers),
    tiers,
  };
}

export function serializeRewardConfigDraft(draft: RewardConfigDraft): RewardConfigRecord {
  return {
    enabled: draft.enabled,
    currency: FIXED_REWARD_CURRENCY,
    settlementWindowDays: normalizeSettlementWindowDays(draft.settlementWindowDays),
    triggers: normalizeTriggers(draft.triggers),
    tiers: getSerializedTiers(draft.tiers),
  };
}

export function addTier(draft: RewardConfigDraft): RewardConfigDraft {
  return {
    ...draft,
    tiers: [
      ...draft.tiers,
      {
        depth: draft.tiers.length + 1,
        type: 'percent',
        value: '0',
        enabled: areAllTiersEnabled(draft.tiers),
      },
    ],
  };
}

export function deleteTier(draft: RewardConfigDraft, depth: number): RewardConfigDraft {
  return {
    ...draft,
    tiers: reindexTiers(draft.tiers.filter((tier) => tier.depth !== depth)),
  };
}

export function updateTier(
  draft: RewardConfigDraft,
  depth: number,
  updates: Partial<Pick<RewardTierDraft, 'type' | 'value'>>,
): RewardConfigDraft {
  return {
    ...draft,
    tiers: draft.tiers.map((tier) =>
      tier.depth === depth
        ? {
            ...tier,
            ...(updates.type ? { type: updates.type } : {}),
            ...(updates.value !== undefined ? { value: updates.value } : {}),
          }
        : tier,
    ),
  };
}

export function setTierEnabled(
  draft: RewardConfigDraft,
  depth: number,
  enabled: boolean,
): RewardConfigDraft {
  return {
    ...draft,
    tiers: draft.tiers.map((tier) =>
      tier.depth >= depth
        ? {
            ...tier,
            enabled,
          }
        : tier,
    ),
  };
}

function getSerializedTiers(tiers: RewardTierDraft[]): RewardConfigTier[] {
  return reindexTiers(tiers).map((tier) => ({
    depth: tier.depth,
    type: tier.type,
    value: tier.value,
    enabled: tier.enabled,
  }));
}

function reindexTiers(tiers: RewardTierDraft[]): RewardTierDraft[] {
  return tiers.map((tier, index) => ({
    ...tier,
    depth: index + 1,
  }));
}

function normalizeSettlementWindowDays(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_SETTLEMENT_WINDOW_DAYS;
  }

  return Math.min(90, Math.max(0, Math.trunc(value)));
}

function normalizeTriggers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_REWARD_TRIGGERS];
  }

  const normalized = value.filter(
    (item): item is string => typeof item === 'string' && item.trim(),
  );
  return normalized.length ? normalized : [...DEFAULT_REWARD_TRIGGERS];
}

function areAllTiersEnabled(tiers: RewardTierDraft[]): boolean {
  return tiers.every((tier) => tier.enabled);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
