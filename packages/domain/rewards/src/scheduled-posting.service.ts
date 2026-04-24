import { prisma, PrismaClient } from '@uprm/db';
import { AccountService, PostingService } from '@uprm/ledger';
import { FraudService } from '@uprm/fraud';
import { WebhookDeliveryService } from '@uprm/webhooks';
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

export interface PostDueRewardsResult {
  posted: number;
  held: number;
}

export interface CompensationInput {
  tenantId: string;
  compensatingEventId: string;
  compensatingEventType: string;
}

export interface CompensationResult {
  linked: boolean;
  cancelled: number;
  reversed: number;
  skipped: number;
}

export class ScheduledPostingService {
  private readonly accounts: AccountService;
  private readonly postings: PostingService;
  private readonly fraud: FraudService;
  private readonly webhooks: WebhookDeliveryService;

  constructor(private db: PrismaClient = prisma) {
    this.accounts = new AccountService(db);
    this.postings = new PostingService(db);
    this.fraud = new FraudService(db);
    this.webhooks = new WebhookDeliveryService(db);
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
          beneficiaryTenantUserId: reward.referrerTenantUserId,
          sourceEventId: input.event.eventId,
          postAt: input.postAt,
          idempotencyKey,
          payload: {
            description: `L${reward.depth} referral reward for event ${input.event.eventId}`,
            currency: reward.currency,
            beneficiaryTenantUserId: reward.referrerTenantUserId,
            rewardDepth: reward.depth,
            postings: [
              { accountId: rewardExpense.id, amount: reward.amountMinor.toString() },
              { accountId: userAccount.id, amount: (-reward.amountMinor).toString() },
            ],
          } as any,
        },
      });

      await this.enqueueEvent(
        'reward.created',
        input.event.tenantId,
        {
          scheduledPostingId: idempotencyKey,
          sourceEventId: input.event.eventId,
          referredTenantUserId: input.event.referredTenantUserId,
          beneficiaryTenantUserId: reward.referrerTenantUserId,
          rewardDepth: reward.depth,
          amountMinor: reward.amountMinor.toString(),
          currency: reward.currency,
          postAt: input.postAt.toISOString(),
        },
        input.event.eventId,
        'uprm.domain.reward.created',
      );
      scheduled++;
    }

    return { scheduled, skipped };
  }

  /**
   * Post all scheduled postings whose postAt is in the past.
   * Returns how many were posted.
   */
  async postDueRewards(now: Date = new Date()): Promise<PostDueRewardsResult> {
    const due = await this.db.scheduledPosting.findMany({
      where: { status: 'pending', postAt: { lte: now } },
      orderBy: { postAt: 'asc' },
      take: 100,
    });

    let posted = 0;
    let held = 0;
    for (const row of due) {
      const activeHold = await this.fraud.getActiveHoldForScheduledPosting(row.id);
      if (activeHold) {
        held++;
        continue;
      }
      const claim = await this.db.scheduledPosting.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'processing' },
      });
      if (claim.count === 0) {
        continue;
      }

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
        if (!result.duplicate) {
          await this.enqueueEvent(
            'reward.approved',
            row.tenantId,
            {
              scheduledPostingId: row.id,
              ledgerEntryId: result.id,
              sourceEventId: row.sourceEventId,
              currency: payload.currency,
              description: payload.description,
            },
            row.sourceEventId,
            'uprm.domain.reward.approved',
          );

          await this.enqueueWalletBalanceChanged(row.tenantId, payload.postings, row.sourceEventId);
          posted++;
        }
      } catch (e: any) {
        await this.db.scheduledPosting.updateMany({
          where: { id: row.id, status: 'processing' },
          data: {
            status: 'pending',
            cancelReason: (e?.message ?? 'posting failed').slice(0, 256),
          },
        });
      }
    }

    return { posted, held };
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

  /**
   * Handle a compensating event (refund / chargeback_opened) linked to a prior
   * reward-triggering event. Pending rewards are cancelled; posted rewards are
   * reversed via equal-and-opposite ledger entries.
   */
  async compensateForLinkedEvent(input: CompensationInput): Promise<CompensationResult> {
    const link = await this.db.eventLink.findFirst({
      where: { tenantId: input.tenantId, eventId: input.compensatingEventId },
    });
    if (!link) {
      return { linked: false, cancelled: 0, reversed: 0, skipped: 1 };
    }

    const cancelled = await this.cancelForEvent(
      link.linkedEventId,
      `${input.compensatingEventType}:${input.compensatingEventId}`,
    );

    const postedRows = await this.db.scheduledPosting.findMany({
      where: {
        tenantId: input.tenantId,
        sourceEventId: link.linkedEventId,
        status: 'posted',
        resultEntryId: { not: null },
      },
    });

    let reversed = 0;
    let skipped = 0;

    for (const row of postedRows) {
      const entry = await this.db.ledgerEntry.findUnique({ where: { id: row.resultEntryId! } });
      if (!entry) {
        skipped++;
        continue;
      }

      const postings = await this.db.ledgerPosting.findMany({
        where: { entryId: entry.id },
      });
      if (!postings.length) {
        skipped++;
        continue;
      }

      const result = await this.postings.postEntry({
        tenantId: input.tenantId,
        currency: entry.currency,
        description: `Reversal for ${entry.description} due to ${input.compensatingEventType}`,
        idempotencyKey: `reversal:${input.compensatingEventType}:${input.compensatingEventId}:${row.id}`,
        sourceEventId: input.compensatingEventId,
        postings: postings.map((p: any) => ({
          accountId: p.accountId,
          amount: -BigInt(p.amount),
        })),
      });

      if (result.duplicate) skipped++;
      else {
        await this.enqueueEvent(
          'refund.reversed',
          input.tenantId,
          {
            scheduledPostingId: row.id,
            compensatingEventId: input.compensatingEventId,
            compensatingEventType: input.compensatingEventType,
            originalEntryId: entry.id,
            reversalEntryId: result.id,
            currency: entry.currency,
          },
          input.compensatingEventId,
          'uprm.domain.refund.reversed',
        );

        await this.enqueueWalletBalanceChanged(
          input.tenantId,
          postings.map((p: any) => ({
            accountId: p.accountId,
            amount: (-BigInt(p.amount)).toString(),
          })),
          input.compensatingEventId,
        );
        reversed++;
      }
    }

    return { linked: true, cancelled, reversed, skipped };
  }

  private async enqueueEvent(
    eventType: 'reward.created' | 'reward.approved' | 'refund.reversed' | 'wallet.balance.changed',
    tenantId: string,
    payload: Record<string, unknown>,
    sourceEventId?: string,
    sourceTopic?: string,
  ) {
    const endpoints = await this.webhooks.getSubscribedEndpoints(tenantId, eventType);
    if (!endpoints.length) {
      return 0;
    }

    return this.webhooks.enqueueForEndpoints(
      {
        eventType,
        tenantId,
        occurredAt: new Date().toISOString(),
        payload,
        ...(sourceEventId ? { sourceEventId } : {}),
        ...(sourceTopic ? { sourceTopic } : {}),
      },
      endpoints,
    );
  }

  private async enqueueWalletBalanceChanged(
    tenantId: string,
    postingRows: Array<{ accountId: string; amount: string }>,
    sourceEventId?: string,
  ) {
    const impactedAccounts = await this.db.ledgerAccount.findMany({
      where: {
        id: { in: postingRows.map((posting) => posting.accountId) },
        accountType: 'user_balance',
        tenantUserId: { not: null },
      },
    });

    for (const account of impactedAccounts) {
      const matchingPosting = postingRows.find((posting) => posting.accountId === account.id);
      if (!matchingPosting || !account.tenantUserId) continue;

      await this.enqueueEvent(
        'wallet.balance.changed',
        tenantId,
        {
          tenantUserId: account.tenantUserId,
          accountId: account.id,
          currency: account.currency,
          deltaMinor: (-BigInt(matchingPosting.amount)).toString(),
          accountType: account.accountType,
        },
        sourceEventId,
        'uprm.domain.wallet.balance.changed',
      );
    }
  }
}
