import { prisma, PrismaClient } from '@uprm/db';

export interface AccountBalance {
  accountId: string;
  accountType: string;
  currency: string;
  tenantUserId: string | null;
  balance: bigint; // sum of all postings
}

export class BalanceService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Balance of a single account (sum of all its postings).
   */
  async getAccountBalance(accountId: string): Promise<AccountBalance | null> {
    const account = await this.db.ledgerAccount.findUnique({ where: { id: accountId } });
    if (!account) return null;

    const agg = await this.db.ledgerPosting.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });
    return {
      accountId: account.id,
      accountType: account.accountType,
      currency: account.currency,
      tenantUserId: account.tenantUserId,
      balance: (agg._sum.amount as unknown as bigint) ?? 0n,
    };
  }

  /**
   * Balances for all accounts belonging to a tenant. Useful for admin dashboards.
   */
  async getTenantBalances(tenantId: string): Promise<AccountBalance[]> {
    const accounts = await this.db.ledgerAccount.findMany({
      where: { tenantId },
      orderBy: [{ currency: 'asc' }, { accountType: 'asc' }],
    });

    const balances: AccountBalance[] = [];
    for (const a of accounts) {
      const agg = await this.db.ledgerPosting.aggregate({
        where: { accountId: a.id },
        _sum: { amount: true },
      });
      balances.push({
        accountId: a.id,
        accountType: a.accountType,
        currency: a.currency,
        tenantUserId: a.tenantUserId,
        balance: (agg._sum.amount as unknown as bigint) ?? 0n,
      });
    }
    return balances;
  }

  /**
   * Balance of a specific user account (tenantUser + currency).
   */
  async getUserBalance(
    tenantId: string,
    tenantUserId: string,
    currency: string,
  ): Promise<AccountBalance | null> {
    const account = await this.db.ledgerAccount.findFirst({
      where: { tenantId, tenantUserId, accountType: 'user_balance', currency },
    });
    if (!account) return null;
    return this.getAccountBalance(account.id);
  }
}
