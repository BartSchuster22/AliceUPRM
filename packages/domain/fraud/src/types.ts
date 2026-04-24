export type FraudSignalType =
  | 'same_ip_multiple_signups'
  | 'same_payment_fingerprint'
  | 'referral_velocity'
  | 'self_referral_attempt'
  | 'high_refund_ratio_cluster';

export type FraudCaseStatus = 'open' | 'allowed' | 'rejected' | 'escalated';
export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RewardHoldStatus = 'active' | 'released' | 'rejected';

export interface FraudConfig {
  enabled: boolean;
  caseThreshold: number;
  scoreWindowHours: number;
  velocityWindowMinutes: number;
  velocityReferralCountThreshold: number;
  refundRatioWindowDays: number;
  refundRatioThreshold: number;
  clusterWindowDays: number;
  signalWeights: Record<FraudSignalType, number>;
}

export interface FraudSignalInput {
  tenantId: string;
  tenantUserId?: string | null;
  signalType: FraudSignalType;
  score?: number;
  sourceEventId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export interface FraudActor {
  actorType: 'system' | 'admin';
  actorId?: string | null;
}

export interface FraudCaseSummary {
  id: string;
  tenantId: string;
  tenantUserId: string | null;
  status: FraudCaseStatus;
  severity: FraudSeverity;
  scoreTotal: number;
  thresholdSnapshot: Record<string, unknown>;
  resolution: string | null;
  resolutionNote: string | null;
  openedBySignalId: string | null;
  openedAt: Date;
  resolvedAt: Date | null;
  holdCount: number;
}

export interface FraudCaseDetail extends FraudCaseSummary {
  openedBySignal: {
    id: string;
    signalType: string;
    score: number;
    severity: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  } | null;
  events: Array<{
    id: string;
    actorType: string;
    actorId: string | null;
    action: string;
    beforeJson: Record<string, unknown> | null;
    afterJson: Record<string, unknown> | null;
    createdAt: Date;
  }>;
  rewardHolds: Array<{
    id: string;
    scheduledPostingId: string;
    status: RewardHoldStatus;
    reasonCode: string;
    createdAt: Date;
    releasedAt: Date | null;
    rejectedAt: Date | null;
  }>;
  relatedSignals: Array<{
    id: string;
    signalType: string;
    score: number;
    severity: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }>;
}

export interface RecordSignalResult {
  signal: {
    id: string;
    tenantId: string;
    tenantUserId: string | null;
    signalType: string;
    score: number;
    severity: string;
    status: string;
    dedupeKey: string | null;
    sourceEventId: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  };
  caseOpened: FraudCaseSummary | null;
  rollingScore: number;
}
