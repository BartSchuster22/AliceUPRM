import { RewardConfig } from './config';

export interface TriggerEvent {
  tenantId: string;
  eventId: string;
  eventType: string;
  occurredAt: Date;
  referredTenantUserId: string; // the user who paid
  amountMinor: bigint; // e.g. 2999 cents for €29.99
  currency: string;
}

export interface Ancestor {
  tenantUserId: string;
  depth: number;
}

export interface ComputedReward {
  referrerTenantUserId: string;
  depth: number;
  amountMinor: bigint;
  currency: string;
}

export interface ComputeRewardsResult {
  eligible: boolean;
  reason?: string | undefined;
  rewards: ComputedReward[];
  postAt: Date; // when scheduled postings should become eligible
}

/**
 * Pure reward computation. No DB, no side effects.
 */
export class RewardService {
  /**
   * Given a trigger event, the tenant's reward config, and the referrer ancestry,
   * produce the list of rewards to schedule.
   */
  computeRewards(
    event: TriggerEvent,
    config: RewardConfig,
    ancestors: Ancestor[],
  ): ComputeRewardsResult {
    const postAt = new Date(event.occurredAt.getTime() + config.settlementWindowDays * 86_400_000);

    if (!config.enabled) {
      return { eligible: false, reason: 'rewards_disabled', rewards: [], postAt };
    }
    if (!config.triggers.includes(event.eventType)) {
      return { eligible: false, reason: 'event_type_not_triggered', rewards: [], postAt };
    }

    const relevantAncestors = ancestors
      .filter((a) => a.depth >= 1 && a.tenantUserId !== event.referredTenantUserId)
      .sort((a, b) => a.depth - b.depth);

    const rewards: ComputedReward[] = [];

    for (const ancestor of relevantAncestors) {
      const tier = config.tiers.find((t) => t.depth === ancestor.depth && t.enabled !== false);
      if (!tier) continue;

      const amountMinor = this.applyTier(event.amountMinor, tier);
      if (amountMinor <= 0n) continue;

      rewards.push({
        referrerTenantUserId: ancestor.tenantUserId,
        depth: ancestor.depth,
        amountMinor,
        currency: config.currency,
      });
    }

    return {
      eligible: rewards.length > 0,
      reason: rewards.length === 0 ? 'no_eligible_ancestors' : undefined,
      rewards,
      postAt,
    };
  }

  /**
   * Apply a tier rule to a base amount. Returns the reward in minor units.
   * Percent values are interpreted as "X percent" (10 → 10%, 2.5 → 2.5%).
   */
  private applyTier(baseMinor: bigint, tier: { type: 'percent' | 'flat'; value: string }): bigint {
    if (tier.type === 'flat') {
      // "5.00" → 500 cents
      return this.parseMoneyToMinor(tier.value);
    }
    // Percent: baseMinor * (value / 100). We scale value by 10000 for 4 decimal precision,
    // then divide back. 10% → 1000. 2.5% → 250.
    const percentScaled = this.parsePercentScaled(tier.value);
    return (baseMinor * percentScaled) / 1_000_000n;
  }

  private parseMoneyToMinor(s: string): bigint {
    const [whole, frac = ''] = s.split('.');
    const cents = (frac + '00').slice(0, 2);
    return BigInt(whole ?? '0') * 100n + BigInt(cents || '0');
  }

  private parsePercentScaled(s: string): bigint {
    // "10" → 100000 (= 10% scaled to 10000), "2.5" → 25000, "0.075" → 750.
    // Formula: scaled = value * 10000 = (whole * 10000) + (frac_padded_to_4 * 1)
    const [whole, frac = ''] = s.split('.');
    const fracPadded = (frac + '0000').slice(0, 4);
    return BigInt(whole ?? '0') * 10_000n + BigInt(fracPadded || '0');
  }
}
