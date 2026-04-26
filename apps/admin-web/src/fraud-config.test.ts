import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAUD_SIGNAL_WEIGHTS,
  FRAUD_SIGNAL_KEYS,
  serializeFraudConfigDraft,
  toFraudConfigDraft,
  updateFraudSignalWeight,
} from './fraud-config';

describe('fraud-config helpers', () => {
  it('normalizes raw fraud config into visual draft state', () => {
    const draft = toFraudConfigDraft({
      enabled: true,
      caseThreshold: 100,
      signalWeights: {
        referral_velocity: 30,
        self_referral_attempt: 100,
        same_ip_multiple_signups: 35,
        same_payment_fingerprint: 45,
        high_refund_ratio_cluster: 60,
      },
      scoreWindowHours: 24,
      clusterWindowDays: 30,
      refundRatioThreshold: 0.5,
      refundRatioWindowDays: 30,
      velocityWindowMinutes: 60,
      velocityReferralCountThreshold: 2,
    });

    expect(draft).toEqual({
      enabled: true,
      caseThreshold: 100,
      scoreWindowHours: 24,
      clusterWindowDays: 30,
      refundRatioThreshold: 0.5,
      refundRatioWindowDays: 30,
      velocityWindowMinutes: 60,
      velocityReferralCountThreshold: 2,
      signalWeights: {
        referral_velocity: 30,
        self_referral_attempt: 100,
        same_ip_multiple_signups: 35,
        same_payment_fingerprint: 45,
        high_refund_ratio_cluster: 60,
      },
    });
  });

  it('fills safe defaults when the raw JSON is empty or partial', () => {
    const draft = toFraudConfigDraft({});

    expect(draft.enabled).toBe(true);
    expect(draft.caseThreshold).toBe(100);
    expect(draft.scoreWindowHours).toBe(24);
    expect(draft.clusterWindowDays).toBe(30);
    expect(draft.refundRatioThreshold).toBe(0.5);
    expect(draft.refundRatioWindowDays).toBe(30);
    expect(draft.velocityWindowMinutes).toBe(60);
    expect(draft.velocityReferralCountThreshold).toBe(5);
    expect(draft.signalWeights).toEqual(DEFAULT_FRAUD_SIGNAL_WEIGHTS);
  });

  it('serializes all live fraud signal keys in a stable shape', () => {
    const draft = toFraudConfigDraft({});
    const serialized = serializeFraudConfigDraft(draft);

    expect(Object.keys(serialized.signalWeights)).toEqual(FRAUD_SIGNAL_KEYS);
    expect(serialized.signalWeights).toEqual(DEFAULT_FRAUD_SIGNAL_WEIGHTS);
  });

  it('updates one signal weight without mutating the others', () => {
    const base = toFraudConfigDraft({});
    const next = updateFraudSignalWeight(base, 'same_payment_fingerprint', 77);

    expect(next.signalWeights.same_payment_fingerprint).toBe(77);
    expect(next.signalWeights.same_ip_multiple_signups).toBe(
      DEFAULT_FRAUD_SIGNAL_WEIGHTS.same_ip_multiple_signups,
    );
    expect(serializeFraudConfigDraft(next).signalWeights.same_payment_fingerprint).toBe(77);
  });
});
