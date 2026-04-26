import { prisma, PrismaClient } from '@uprm/db';
import { AccountService, PostingService } from '@uprm/ledger';
import { FIXED_REWARD_CURRENCY } from '@uprm/rewards';
import { WalletAccountService, WalletBalanceService, WalletPayoutService } from '@uprm/wallet';

export class PayoutError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'PayoutError';
  }
}

export interface RequestPayoutInput {
  tenantId: string;
  tenantUserId: string;
  amountMinor: bigint;
  payoutMethod: string;
  destination: Record<string, unknown>;
  destinationCurrency?: string;
}

export class PayoutService {
  private readonly accounts: AccountService;
  private readonly postings: PostingService;
  private readonly walletAccounts: WalletAccountService;
  private readonly walletBalances: WalletBalanceService;
  private readonly walletPayouts: WalletPayoutService;

  constructor(private db: PrismaClient = prisma) {
    this.accounts = new AccountService(db);
    this.postings = new PostingService(db);
    this.walletAccounts = new WalletAccountService(db);
    this.walletBalances = new WalletBalanceService(db);
    this.walletPayouts = new WalletPayoutService(db);
  }

  async requestPayout(input: RequestPayoutInput): Promise<any> {
    if (input.amountMinor <= 0n) {
      throw new PayoutError('amount must be positive', 'BAD_AMOUNT');
    }

    const tenantUser = await this.db.tenantUser.findFirst({
      where: { id: input.tenantUserId, tenantId: input.tenantId },
    });
    if (!tenantUser) throw new PayoutError('tenant user not found', 'TENANT_USER_NOT_FOUND');

    const tenant = await this.db.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) throw new PayoutError('tenant not found', 'TENANT_NOT_FOUND');

    const rewardCurrency = FIXED_REWARD_CURRENCY;
    const walletAccount = await this.walletAccounts.ensureAccount({
      userId: tenantUser.userId,
    });
    const walletBalance = await this.walletBalances.getWalletBalance(walletAccount.id);
    if (walletBalance.balanceCredits < input.amountMinor) {
      throw new PayoutError('insufficient balance', 'INSUFFICIENT_BALANCE');
    }

    const payout = await this.db.payoutRequest.create({
      data: {
        tenantId: input.tenantId,
        tenantUserId: input.tenantUserId,
        userId: tenantUser.userId,
        walletAccountId: walletAccount.id,
        amountMinor: input.amountMinor,
        amountCredits: input.amountMinor,
        baseCurrency: rewardCurrency,
        destinationCurrency: input.destinationCurrency ?? null,
        payoutMethod: input.payoutMethod,
        destination: input.destination as any,
        status: 'requested',
      },
    });

    const { reservation, allocations } = await this.walletPayouts.reservePayout({
      walletAccountId: walletAccount.id,
      payoutRequestId: payout.id,
      amountCredits: input.amountMinor,
    });

    const issuerBreakdownJson = allocations.map((allocation) => ({
      issuerTenantId: allocation.issuerTenantId ?? null,
      walletGrantId: allocation.walletGrantId,
      amountCredits: allocation.amountCredits.toString(),
    }));

    const updatedPayout = await this.db.payoutRequest.update({
      where: { id: payout.id },
      data: {
        issuerBreakdownJson: issuerBreakdownJson as any,
      },
    });

    await this.db.walletPayoutReservation.update({
      where: { id: reservation.id },
      data: { payoutRequestId: updatedPayout.id },
    } as any);

    return updatedPayout;
  }

  async listUserPayouts(tenantId: string, tenantUserId: string): Promise<any[]> {
    return this.db.payoutRequest.findMany({
      where: { tenantId, tenantUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayout(payoutId: string): Promise<any> {
    return this.requirePayout(payoutId);
  }

  async approvePayout(payoutId: string): Promise<any> {
    const payout = await this.requirePayout(payoutId);
    if (payout.status !== 'requested') {
      throw new PayoutError('only requested payouts can be approved', 'BAD_STATUS');
    }
    return this.db.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'approved', approvedAt: new Date() },
    });
  }

  async markSent(payoutId: string): Promise<any> {
    const payout = await this.requirePayout(payoutId);
    if (payout.status !== 'approved') {
      throw new PayoutError('only approved payouts can be marked sent', 'BAD_STATUS');
    }

    const reservation = await this.requireWalletReservation(payout.id);
    await this.walletPayouts.markSent(reservation.id);

    const cash = await this.accounts.ensureSystemAccount({
      tenantId: payout.tenantId,
      accountType: 'tenant_cash',
      currency: payout.baseCurrency,
    });
    const payable = await this.accounts.ensureSystemAccount({
      tenantId: payout.tenantId,
      accountType: 'payout_payable',
      currency: payout.baseCurrency,
    });

    await this.postings.postEntry({
      tenantId: payout.tenantId,
      currency: payout.baseCurrency,
      description: `Execute payout ${payout.id}`,
      idempotencyKey: `payout-sent:${payout.id}`,
      postings: [
        { accountId: cash.id, amount: -payout.amountMinor },
        { accountId: payable.id, amount: payout.amountMinor },
      ],
    });

    return this.db.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'sent', sentAt: new Date() },
    });
  }

  async failPayout(payoutId: string, reason?: string): Promise<any> {
    const payout = await this.requirePayout(payoutId);
    if (!['requested', 'approved'].includes(payout.status)) {
      throw new PayoutError('only requested or approved payouts can fail', 'BAD_STATUS');
    }
    const reservation = await this.requireWalletReservation(payout.id);
    await this.walletPayouts.releaseReservation(reservation.id);
    return this.db.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'failed', failureReason: reason ?? null, failedAt: new Date() },
    });
  }

  async cancelPayout(payoutId: string): Promise<any> {
    const payout = await this.requirePayout(payoutId);
    if (payout.status !== 'requested') {
      throw new PayoutError('only requested payouts can be cancelled', 'BAD_STATUS');
    }
    const reservation = await this.requireWalletReservation(payout.id);
    await this.walletPayouts.releaseReservation(reservation.id);
    return this.db.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  }

  private async releaseBackToUser(payout: any, action: 'failed' | 'cancelled'): Promise<void> {
    const payable = await this.accounts.ensureSystemAccount({
      tenantId: payout.tenantId,
      accountType: 'payout_payable',
      currency: payout.baseCurrency,
    });
    const userBalance = await this.accounts.ensureUserBalanceAccount({
      tenantId: payout.tenantId,
      tenantUserId: payout.tenantUserId,
      currency: payout.baseCurrency,
    });

    await this.postings.postEntry({
      tenantId: payout.tenantId,
      currency: payout.baseCurrency,
      description: `Release payout ${payout.id}`,
      idempotencyKey: `payout-${action}:${payout.id}`,
      postings: [
        { accountId: payable.id, amount: payout.amountMinor },
        { accountId: userBalance.id, amount: -payout.amountMinor },
      ],
    });
  }

  private async requireWalletReservation(payoutRequestId: string): Promise<any> {
    const reservation = await this.db.walletPayoutReservation.findFirst({
      where: { payoutRequestId },
    } as any);
    if (!reservation) {
      throw new PayoutError('wallet payout reservation not found', 'WALLET_PAYOUT_NOT_FOUND');
    }
    return reservation;
  }

  private async requirePayout(payoutId: string): Promise<any> {
    const payout = await this.db.payoutRequest.findUnique({ where: { id: payoutId } });
    if (!payout) throw new PayoutError('payout not found', 'PAYOUT_NOT_FOUND');
    return payout;
  }
}
