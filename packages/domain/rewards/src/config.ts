import { z } from 'zod';

/**
 * Reward configuration per tenant.
 * Stored at tenant_configs.rewardConfig and validated on every read.
 */
export const RewardConfigSchema = z.object({
  enabled: z.boolean().default(false),
  currency: z.string().regex(/^[A-Z]{3}$/),
  settlementWindowDays: z.number().int().min(0).max(90),
  triggers: z.array(z.string()).min(1),
  tiers: z
    .array(
      z.object({
        depth: z.number().int().min(1).max(10),
        type: z.enum(['percent', 'flat']),
        value: z.string().regex(/^\d+(\.\d{1,4})?$/), // "10", "2.5", "0.075"
      }),
    )
    .min(1),
});

export type RewardConfig = z.infer<typeof RewardConfigSchema>;

export class RewardConfigError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'RewardConfigError';
  }
}

/**
 * Parse raw JSON (from DB) into a validated RewardConfig. Throws RewardConfigError
 * if invalid. Callers should treat an invalid config as "rewards disabled for this tenant".
 */
export function parseRewardConfig(raw: unknown): RewardConfig {
  const result = RewardConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new RewardConfigError(
      `invalid reward config: ${result.error.issues.map((i) => i.message).join('; ')}`,
      'INVALID_CONFIG',
    );
  }
  return result.data;
}
