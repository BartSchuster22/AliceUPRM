import { z } from 'zod';
import type { FraudConfig, FraudSignalType } from './types';

const signalWeightsSchema = z.object({
  same_ip_multiple_signups: z.coerce.number().int().nonnegative().optional(),
  same_payment_fingerprint: z.coerce.number().int().nonnegative().optional(),
  referral_velocity: z.coerce.number().int().nonnegative().optional(),
  self_referral_attempt: z.coerce.number().int().nonnegative().optional(),
  high_refund_ratio_cluster: z.coerce.number().int().nonnegative().optional(),
});

const fraudConfigSchema = z.object({
  enabled: z.coerce.boolean().optional(),
  caseThreshold: z.coerce.number().int().positive().optional(),
  scoreWindowHours: z.coerce.number().int().positive().optional(),
  velocityWindowMinutes: z.coerce.number().int().positive().optional(),
  velocityReferralCountThreshold: z.coerce.number().int().positive().optional(),
  refundRatioWindowDays: z.coerce.number().int().positive().optional(),
  refundRatioThreshold: z.coerce.number().positive().optional(),
  clusterWindowDays: z.coerce.number().int().positive().optional(),
  signalWeights: signalWeightsSchema.optional(),
});

const DEFAULT_SIGNAL_WEIGHTS: Record<FraudSignalType, number> = {
  same_ip_multiple_signups: 35,
  same_payment_fingerprint: 45,
  referral_velocity: 30,
  self_referral_attempt: 100,
  high_refund_ratio_cluster: 60,
};

export function parseFraudConfig(raw: unknown): FraudConfig {
  const parsed = fraudConfigSchema.parse(raw ?? {});

  const weights = parsed.signalWeights ?? {};

  return {
    enabled: parsed.enabled ?? true,
    caseThreshold: parsed.caseThreshold ?? 100,
    scoreWindowHours: parsed.scoreWindowHours ?? 24,
    velocityWindowMinutes: parsed.velocityWindowMinutes ?? 60,
    velocityReferralCountThreshold: parsed.velocityReferralCountThreshold ?? 5,
    refundRatioWindowDays: parsed.refundRatioWindowDays ?? 30,
    refundRatioThreshold: parsed.refundRatioThreshold ?? 0.5,
    clusterWindowDays: parsed.clusterWindowDays ?? 30,
    signalWeights: {
      same_ip_multiple_signups:
        weights.same_ip_multiple_signups ?? DEFAULT_SIGNAL_WEIGHTS.same_ip_multiple_signups,
      same_payment_fingerprint:
        weights.same_payment_fingerprint ?? DEFAULT_SIGNAL_WEIGHTS.same_payment_fingerprint,
      referral_velocity: weights.referral_velocity ?? DEFAULT_SIGNAL_WEIGHTS.referral_velocity,
      self_referral_attempt:
        weights.self_referral_attempt ?? DEFAULT_SIGNAL_WEIGHTS.self_referral_attempt,
      high_refund_ratio_cluster:
        weights.high_refund_ratio_cluster ?? DEFAULT_SIGNAL_WEIGHTS.high_refund_ratio_cluster,
    },
  };
}
