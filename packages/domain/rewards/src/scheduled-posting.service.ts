import { prisma, PrismaClient } from '@uprm/db';
import { AccountService, PostingService } from '@uprm/ledger';
import type { ComputedReward, TriggerEvent } from './reward.service';

export interface ScheduleInput {
  event: TriggerEvent;
  rewards: ComputedReward[];
  postAt: Date;
}

export interface ScheduleResult {
  scheduled: number;
  skipped: number;
}

export class ScheduledPostingService {
  private readonly accounts: AccountService;
  private readonly postings: PostingService;

  constructor(private db: PrismaClient = prisma) {
    this.accounts = new AccountService(db);
    this.postings = new PostingService(db);
  }

  /**
   * Persist computed rewards as scheduled_postings rows. Idempotent per
   * (tenantId, idempotencyKey) — re-running for the same event is safe.
   */
  async scheduleRewards(input: ScheduleInput): Promise<ScheduleResult> {
    let scheduled = 0;
    let skipped = 0;

    for (const reward of input.rewards) {
      const idempotencyKey = `reward:${input.event.eventId}:d${reward.depth}:${reward.referrerTenantUserId}`;

      const userAccount = await this.accounts.ensureUserBalanceAccount({
        tenantId: input.event.tenantId,
        tenantUserId: reward.referrerTenantUserId,
        currency: reward.currency,
      });
      const rewardExpense = await this.accounts.ensureSystemAccount({
        tenantId: input.event.tenantId,
        accountType: 'tenant_reward_expense',
        currency: reward.currency,
      });

      const existing = await this.db.scheduledPosting.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.event.tenantId,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await this.db.scheduledPosting.create({
        data: {
          tenantId: input.event.tenantId,
          sourceEventId: input.event.eventId,
          postAt: input.postAt,
          idempotencyKey,
          payload: {
            description: `L${reward.depth} referral reward for event ${input.event.eventId}`,
            currency: reward.currency,
            postings: [
              { accountId: rewardExpense.id, amount: reward.amountMinor.toString() },
              { accountId: userAccount.id, amount: (-reward.amountMinor).toString() },
            ],
          } as any,
        },
      });
      scheduled++;
    }

    return { scheduled, skipped };
  }

  /**
   * Post all scheduled postings whose postAt is in the past.
   * Returns how many were posted.
   */
  async postDueRewards(now: Date = new Date()): Promise<number> {
    const due = await this.db.scheduledPosting.findMany({
      where: { status: 'pending', postAt: { lte: now } },
      orderBy: { postAt: 'asc' },
      take: 100,
    });

    let posted = 0;
    for (const row of due) {
      try {
        const payload = row.payload as any;
        const result = await this.postings.postEntry({
          tenantId: row.tenantId,
          currency: payload.currency,
          description: payload.description,
          idempotencyKey: `scheduled:${row.id}`,
          sourceEventId: row.sourceEventId,
          postings: payload.postings.map((p: any) => ({
            accountId: p.accountId,
            amount: BigInt(p.amount),
          })),
        });

        await this.db.scheduledPosting.update({
          where: { id: row.id },
          data: { status: 'posted', resultEntryId: result.id },
        });
        posted++;
      } catch (e: any) {
        await this.db.scheduledPosting.update({
          where: { id: row.id },
          data: {
            status: 'pending',
            cancelReason: (e?.message ?? 'posting failed').slice(0, 256),
          },
        });
      }
    }

    return posted;
  }

  /**
   * Cancel all pending scheduled postings for an event (e.g. refund/chargeback).
   */
  async cancelForEvent(sourceEventId: string, reason: string): Promise<number> {
    const result = await this.db.scheduledPosting.updateMany({
      where: { sourceEventId, status: 'pending' },
      data: { status: 'cancelled', cancelReason: reason.slice(0, 256) },
    });
    return result.count;
  }
}
