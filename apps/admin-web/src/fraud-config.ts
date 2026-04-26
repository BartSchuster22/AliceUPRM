export const FRAUD_SIGNAL_KEYS = [
  'referral_velocity',
  'self_referral_attempt',
  'same_ip_multiple_signups',
  'same_payment_fingerprint',
  'high_refund_ratio_cluster',
] as const;

export type FraudSignalKey = (typeof FRAUD_SIGNAL_KEYS)[number];

export interface FraudSignalWeightsRecord {
  referral_velocity: number;
  self_referral_attempt: number;
  same_ip_multiple_signups: number;
  same_payment_fingerprint: number;
  high_refund_ratio_cluster: number;
}

export interface FraudConfigRecord {
  enabled: boolean;
  caseThreshold: number;
  scoreWindowHours: number;
  velocityWindowMinutes: number;
  velocityReferralCountThreshold: number;
  refundRatioWindowDays: number;
  refundRatioThreshold: number;
  clusterWindowDays: number;
  signalWeights: FraudSignalWeightsRecord;
}

export interface FraudConfigDraft extends FraudConfigRecord {}

export const DEFAULT_FRAUD_SIGNAL_WEIGHTS: FraudSignalWeightsRecord = {
  referral_velocity: 30,
  self_referral_attempt: 100,
  same_ip_multiple_signups: 35,
  same_payment_fingerprint: 45,
  high_refund_ratio_cluster: 60,
};

export const DEFAULT_FRAUD_CONFIG: FraudConfigRecord = {
  enabled: true,
  caseThreshold: 100,
  scoreWindowHours: 24,
  velocityWindowMinutes: 60,
  velocityReferralCountThreshold: 5,
  refundRatioWindowDays: 30,
  refundRatioThreshold: 0.5,
  clusterWindowDays: 30,
  signalWeights: DEFAULT_FRAUD_SIGNAL_WEIGHTS,
};

export function toFraudConfigDraft(raw: unknown): FraudConfigDraft {
  const source = isRecord(raw) ? raw : {};
  const rawSignalWeights = isRecord(source.signalWeights) ? source.signalWeights : {};

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_FRAUD_CONFIG.enabled),
    caseThreshold: normalizeInteger(source.caseThreshold, DEFAULT_FRAUD_CONFIG.caseThreshold),
    scoreWindowHours: normalizeInteger(
      source.scoreWindowHours,
      DEFAULT_FRAUD_CONFIG.scoreWindowHours,
    ),
    velocityWindowMinutes: normalizeInteger(
      source.velocityWindowMinutes,
      DEFAULT_FRAUD_CONFIG.velocityWindowMinutes,
    ),
    velocityReferralCountThreshold: normalizeInteger(
      source.velocityReferralCountThreshold,
      DEFAULT_FRAUD_CONFIG.velocityReferralCountThreshold,
    ),
    refundRatioWindowDays: normalizeInteger(
      source.refundRatioWindowDays,
      DEFAULT_FRAUD_CONFIG.refundRatioWindowDays,
    ),
    refundRatioThreshold: normalizeDecimal(
      source.refundRatioThreshold,
      DEFAULT_FRAUD_CONFIG.refundRatioThreshold,
    ),
    clusterWindowDays: normalizeInteger(
      source.clusterWindowDays,
      DEFAULT_FRAUD_CONFIG.clusterWindowDays,
    ),
    signalWeights: {
      referral_velocity: normalizeInteger(
        rawSignalWeights.referral_velocity,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.referral_velocity,
      ),
      self_referral_attempt: normalizeInteger(
        rawSignalWeights.self_referral_attempt,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.self_referral_attempt,
      ),
      same_ip_multiple_signups: normalizeInteger(
        rawSignalWeights.same_ip_multiple_signups,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.same_ip_multiple_signups,
      ),
      same_payment_fingerprint: normalizeInteger(
        rawSignalWeights.same_payment_fingerprint,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.same_payment_fingerprint,
      ),
      high_refund_ratio_cluster: normalizeInteger(
        rawSignalWeights.high_refund_ratio_cluster,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.high_refund_ratio_cluster,
      ),
    },
  };
}

export function serializeFraudConfigDraft(draft: FraudConfigDraft): FraudConfigRecord {
  return {
    enabled: normalizeBoolean(draft.enabled, DEFAULT_FRAUD_CONFIG.enabled),
    caseThreshold: normalizeInteger(draft.caseThreshold, DEFAULT_FRAUD_CONFIG.caseThreshold),
    scoreWindowHours: normalizeInteger(
      draft.scoreWindowHours,
      DEFAULT_FRAUD_CONFIG.scoreWindowHours,
    ),
    velocityWindowMinutes: normalizeInteger(
      draft.velocityWindowMinutes,
      DEFAULT_FRAUD_CONFIG.velocityWindowMinutes,
    ),
    velocityReferralCountThreshold: normalizeInteger(
      draft.velocityReferralCountThreshold,
      DEFAULT_FRAUD_CONFIG.velocityReferralCountThreshold,
    ),
    refundRatioWindowDays: normalizeInteger(
      draft.refundRatioWindowDays,
      DEFAULT_FRAUD_CONFIG.refundRatioWindowDays,
    ),
    refundRatioThreshold: normalizeDecimal(
      draft.refundRatioThreshold,
      DEFAULT_FRAUD_CONFIG.refundRatioThreshold,
    ),
    clusterWindowDays: normalizeInteger(
      draft.clusterWindowDays,
      DEFAULT_FRAUD_CONFIG.clusterWindowDays,
    ),
    signalWeights: {
      referral_velocity: normalizeInteger(
        draft.signalWeights.referral_velocity,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.referral_velocity,
      ),
      self_referral_attempt: normalizeInteger(
        draft.signalWeights.self_referral_attempt,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.self_referral_attempt,
      ),
      same_ip_multiple_signups: normalizeInteger(
        draft.signalWeights.same_ip_multiple_signups,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.same_ip_multiple_signups,
      ),
      same_payment_fingerprint: normalizeInteger(
        draft.signalWeights.same_payment_fingerprint,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.same_payment_fingerprint,
      ),
      high_refund_ratio_cluster: normalizeInteger(
        draft.signalWeights.high_refund_ratio_cluster,
        DEFAULT_FRAUD_SIGNAL_WEIGHTS.high_refund_ratio_cluster,
      ),
    },
  };
}

export function updateFraudSignalWeight(
  draft: FraudConfigDraft,
  key: FraudSignalKey,
  value: number,
): FraudConfigDraft {
  return {
    ...draft,
    signalWeights: {
      ...draft.signalWeights,
      [key]: normalizeInteger(value, DEFAULT_FRAUD_SIGNAL_WEIGHTS[key]),
    },
  };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return Math.trunc(value);
}

function normalizeDecimal(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
