import { prisma, PrismaClient } from '@uprm/db';

const CREDIT_CURRENCY = 'credit' as const;

export class WalletBalanceService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getWalletBalance(walletAccountId: string) {
    const aggregate = await this.db.walletGrant.aggregate({
      where: { walletAccountId },
      _sum: { amountRemaining: true },
    } as any);

    const balanceCredits = aggregate._sum?.amountRemaining ?? 0n;

    return {
      walletAccountId,
      currency: CREDIT_CURRENCY,
      balanceCredits,
    };
  }

  async getUserWalletBalance(userId: string) {
    const walletAccount = await this.db.walletAccount.findFirst({
      where: { userId, currency: CREDIT_CURRENCY },
    } as any);
    if (!walletAccount) {
      return {
        walletAccountId: null,
        currency: CREDIT_CURRENCY,
        balanceCredits: 0n,
      };
    }

    return this.getWalletBalance(walletAccount.id);
  }

  async getIssuerBalanceForWallet(walletAccountId: string, issuerTenantId: string) {
    const aggregate = await this.db.walletGrant.aggregate({
      where: { walletAccountId, issuerTenantId },
      _sum: { amountRemaining: true },
    } as any);

    const balanceCredits = aggregate._sum?.amountRemaining ?? 0n;

    return {
      walletAccountId,
      issuerTenantId,
      balanceCredits,
    };
  }
}
