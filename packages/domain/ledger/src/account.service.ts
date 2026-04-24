import { prisma, PrismaClient } from '@uprm/db';
import { LedgerError } from './errors';

/**
 * Known system account types. User accounts use 'user_balance'.
 */
export const SYSTEM_ACCOUNT_TYPES = [
  'tenant_cash',
  'tenant_revenue',
  'tenant_reward_expense',
  'platform_fee',
] as const;
export type SystemAccountType = (typeof SYSTEM_ACCOUNT_TYPES)[number];

export interface SystemAccountInput {
  tenantId: string;
  accountType: SystemAccountType;
  currency: string;
}

export interface UserAccountInput {
  tenantId: string;
  tenantUserId: string;
  currency: string;
}

export class AccountService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Ensure a system account (e.g. tenant_cash EUR) exists. Idempotent.
   */
  async ensureSystemAccount(input: SystemAccountInput): Promise<any> {
    if (!SYSTEM_ACCOUNT_TYPES.includes(input.accountType)) {
      throw new LedgerError(
        `unknown system account type: ${input.accountType}`,
        'UNKNOWN_ACCOUNT_TYPE',
      );
    }
    if (!isValidCurrency(input.currency)) {
      throw new LedgerError(`invalid currency: ${input.currency}`, 'BAD_CURRENCY');
    }

    const existing = await this.db.ledgerAccount.findFirst({
      where: {
        tenantId: input.tenantId,
        accountType: input.accountType,
        tenantUserId: null,
        currency: input.currency,
      },
    });
    if (existing) return existing;

    return this.db.ledgerAccount.create({
      data: {
        tenantId: input.tenantId,
        accountType: input.accountType,
        tenantUserId: null,
        currency: input.currency,
      },
    });
  }

  /**
   * Ensure a user_balance account (per tenantUser + currency) exists. Idempotent.
   */
  async ensureUserBalanceAccount(input: UserAccountInput): Promise<any> {
    if (!isValidCurrency(input.currency)) {
      throw new LedgerError(`invalid currency: ${input.currency}`, 'BAD_CURRENCY');
    }

    const existing = await this.db.ledgerAccount.findFirst({
      where: {
        tenantId: input.tenantId,
        accountType: 'user_balance',
        tenantUserId: input.tenantUserId,
        currency: input.currency,
      },
    });
    if (existing) return existing;

    return this.db.ledgerAccount.create({
      data: {
        tenantId: input.tenantId,
        accountType: 'user_balance',
        tenantUserId: input.tenantUserId,
        currency: input.currency,
      },
    });
  }

  async getAccount(accountId: string): Promise<any> {
    return this.db.ledgerAccount.findUnique({ where: { id: accountId } });
  }

  /**
   * Provision the standard set of system accounts for a tenant in a given currency.
   * Called once when a tenant is created, or on-demand the first time we need them.
   */
  async provisionTenantAccounts(tenantId: string, currency: string): Promise<any[]> {
    const results: any[] = [];
    for (const accountType of SYSTEM_ACCOUNT_TYPES.filter((t) => t !== 'platform_fee')) {
      results.push(await this.ensureSystemAccount({ tenantId, accountType, currency }));
    }
    return results;
  }
}

function isValidCurrency(c: string): boolean {
  return /^[A-Z]{3}$/.test(c);
}
