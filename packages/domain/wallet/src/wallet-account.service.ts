import { prisma, PrismaClient } from '@uprm/db';
import type { EnsureWalletAccountInput } from './types';

const CREDIT_CURRENCY = 'credit' as const;

export class WalletAccountService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async ensureAccount(input: EnsureWalletAccountInput) {
    const currency = input.currency ?? CREDIT_CURRENCY;
    const existing = await this.db.walletAccount.findFirst({
      where: { userId: input.userId, currency },
    } as any);
    if (existing) {
      return existing;
    }

    return this.db.walletAccount.create({
      data: {
        userId: input.userId,
        currency,
        status: 'active',
      },
    } as any);
  }

  async getAccountByUser(userId: string, currency: string = CREDIT_CURRENCY) {
    return this.db.walletAccount.findFirst({
      where: { userId, currency },
    } as any);
  }
}
