import { randomUUID } from 'node:crypto';
import { prisma } from '@uprm/db';
import { AccountService, BalanceService, PostingService } from '@uprm/ledger';
import { PayoutService } from '@uprm/payouts';
import { ReferralService } from '@uprm/referrals';
import {
  WalletAccountService,
  WalletBalanceService,
  WalletGrantService,
} from '@uprm/wallet';

export class AdminUsersService {
  private readonly db = prisma;
  private readonly balances = new BalanceService(prisma);
  private readonly accounts = new AccountService(prisma);
  private readonly postings = new PostingService(prisma);
  private readonly payouts = new PayoutService(prisma);
  private readonly referrals = new ReferralService(prisma);
  private readonly walletAccounts = new WalletAccountService(prisma);
  private readonly walletGrants = new WalletGrantService(prisma);
  private readonly walletBalances = new WalletBalanceService(prisma);

  async listUsers(input: { tenantId: string; q?: string; limit?: number }) {
    const query = input.q?.trim();
    return this.db.tenantUser.findMany({
      where: {
        tenantId: input.tenantId,
        OR: query
          ? [
              { externalUserId: { contains: query, mode: 'insensitive' } },
              { username: { contains: query, mode: 'insensitive' } },
              {
                user: {
                  emailNormalized: { contains: query, mode: 'insensitive' },
                },
              },
            ]
          : undefined,
      },
      include: { user: true },
      orderBy: [{ joinedAt: 'desc' }],
      take: input.limit ?? 25,
    });
  }

  async getUserDetail(tenantId: string, tenantUserId: string) {
    const tenantUser = await this.db.tenantUser.findFirst({
      where: { tenantId, id: tenantUserId },
      include: { user: true },
    });
    if (!tenantUser) return null;

    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const baseCurrency = tenant?.baseCurrency ?? 'EUR';
    const balance = await this.balances.getUserBalance(
      tenantId,
      tenantUserId,
      baseCurrency,
    );
    const payouts = await this.payouts.listUserPayouts(tenantId, tenantUserId);

    const [
      sourceTenant,
      sourceTenantUser,
      memberships,
      effectiveReferralChain,
    ] = await Promise.all([
      tenantUser.sourceTenantId
        ? this.db.tenant.findUnique({
            where: { id: tenantUser.sourceTenantId },
          })
        : Promise.resolve(null),
      tenantUser.sourceTenantUserId
        ? this.db.tenantUser.findFirst({
            where: { id: tenantUser.sourceTenantUserId },
            include: { user: true },
          })
        : Promise.resolve(null),
      this.db.tenantUser.findMany({
        where: { userId: tenantUser.userId },
        include: {
          tenant: true,
          user: true,
        },
        orderBy: [{ joinedAt: 'asc' }],
      }),
      this.referrals.getEffectiveReferralChain(tenantId, tenantUserId, 3),
    ]);

    const activePromoterProfiles = await this.db.promoterProfile.findMany({
      where: {
        tenantUserId: {
          in: memberships.map((membership: any) => membership.id),
        },
        effectiveTo: null,
      },
      orderBy: [{ effectiveFrom: 'desc' }],
    } as any);
    const membershipById = new Map(
      memberships.map((membership: any) => [membership.id, membership]),
    );
    const promoterMemberships = activePromoterProfiles.map((profile: any) => ({
      ...profile,
      tenantUser: membershipById.get(profile.tenantUserId) ?? null,
    }));

    const walletAccount = await this.walletAccounts.getAccountByUser(
      tenantUser.userId,
    );
    const walletBalance = walletAccount
      ? await this.walletBalances.getWalletBalance(walletAccount.id)
      : { walletAccountId: null, currency: 'credit', balanceCredits: 0n };
    const walletIssuerBalance = walletAccount
      ? await this.walletBalances.getIssuerBalanceForWallet(
          walletAccount.id,
          tenantId,
        )
      : { walletAccountId: null, issuerTenantId: tenantId, balanceCredits: 0n };
    const legacyTenantBalanceCredits = balance ? -balance.balance : 0n;

    return {
      tenantUser,
      balance,
      payouts,
      sourceTenant,
      sourceTenantUser,
      memberships,
      effectiveReferralChain,
      promoterMemberships,
      walletDiagnostics: {
        walletAccount,
        globalBalanceCredits: walletBalance.balanceCredits.toString(),
        issuerBalanceCredits: walletIssuerBalance.balanceCredits.toString(),
        legacyTenantBalanceCredits: legacyTenantBalanceCredits.toString(),
        parityDeltaCredits: (
          walletIssuerBalance.balanceCredits - legacyTenantBalanceCredits
        ).toString(),
      },
    };
  }

  async getLedgerStatement(tenantId: string, tenantUserId: string) {
    const accounts = await this.db.ledgerAccount.findMany({
      where: { tenantId, tenantUserId },
      orderBy: [{ currency: 'asc' }, { createdAt: 'asc' }],
    });
    const accountIds = accounts.map((account: { id: string }) => account.id);
    if (!accountIds.length) {
      return [];
    }

    const postings = await this.db.ledgerPosting.findMany({
      where: { accountId: { in: accountIds } },
      include: {
        account: true,
        entry: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });

    return postings.map(
      (posting: {
        id: string;
        createdAt: Date;
        amount: bigint;
        currency: string;
        accountId: string;
        entryId: string;
        account: { accountType: string };
        entry: {
          description: string;
          idempotencyKey: string;
          sourceEventId: string | null;
        };
      }) => ({
        postingId: posting.id,
        createdAt: posting.createdAt,
        amount: posting.amount,
        currency: posting.currency,
        accountId: posting.accountId,
        accountType: posting.account.accountType,
        entryId: posting.entryId,
        description: posting.entry.description,
        idempotencyKey: posting.entry.idempotencyKey,
        sourceEventId: posting.entry.sourceEventId,
      }),
    );
  }

  async getReferralTree(tenantId: string, tenantUserId: string, depth = 3) {
    return this.referrals.getReferralTree(tenantId, tenantUserId, depth);
  }

  async createManualAdjustment(input: {
    tenantId: string;
    tenantUserId: string;
    amountMinor: bigint;
    currency?: string;
    reasonCode: string;
    note?: string;
  }) {
    const tenantUser = await this.db.tenantUser.findFirst({
      where: { tenantId: input.tenantId, id: input.tenantUserId },
    });
    if (!tenantUser) {
      throw new Error('tenant user not found');
    }

    const tenant = await this.db.tenant.findUnique({
      where: { id: input.tenantId },
    });
    if (!tenant) {
      throw new Error('tenant not found');
    }

    const currency = input.currency ?? tenant.baseCurrency;
    const userBalance = await this.accounts.ensureUserBalanceAccount({
      tenantId: input.tenantId,
      tenantUserId: input.tenantUserId,
      currency,
    });
    const expense = await this.accounts.ensureSystemAccount({
      tenantId: input.tenantId,
      accountType: 'tenant_reward_expense',
      currency,
    });

    const amount = input.amountMinor;
    const postings =
      amount >= 0n
        ? [
            { accountId: expense.id, amount },
            { accountId: userBalance.id, amount: -amount },
          ]
        : [
            { accountId: userBalance.id, amount: -amount },
            { accountId: expense.id, amount },
          ];

    const description = `manual_adjustment:${input.reasonCode}${input.note ? `:${input.note}` : ''}`;
    const result = await this.postings.postEntry({
      tenantId: input.tenantId,
      currency,
      description,
      idempotencyKey: `manual-adjustment:${input.tenantUserId}:${randomUUID()}`,
      postings,
    });

    const walletAccount = await this.walletAccounts.ensureAccount({
      userId: tenantUser.userId,
    });
    await this.walletGrants.recordDelta({
      walletAccountId: walletAccount.id,
      issuerTenantId: input.tenantId,
      sourceTenantUserId: input.tenantUserId,
      originType: 'manual_adjustment',
      sourceReferenceType: 'manual_adjustment',
      sourceReferenceId: result.id,
      amountDelta: input.amountMinor,
    });

    return {
      entryId: result.id,
      duplicate: result.duplicate,
      tenantId: input.tenantId,
      tenantUserId: input.tenantUserId,
      amountMinor: input.amountMinor,
      currency,
      reasonCode: input.reasonCode,
      note: input.note ?? null,
    };
  }
}
