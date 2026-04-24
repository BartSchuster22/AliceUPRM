import { prisma, PrismaClient } from '@uprm/db';
import { LedgerError } from './errors';

export interface PostingInput {
  accountId: string;
  amount: bigint; // positive = debit, negative = credit
}

export interface PostEntryInput {
  tenantId: string;
  currency: string;
  description: string;
  idempotencyKey: string;
  sourceEventId?: string;
  postings: PostingInput[];
}

export interface PostedEntry {
  id: string;
  duplicate: boolean;
}

export class PostingService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Post a new ledger entry with its postings. Atomic: either all rows commit
   * or none do. Idempotent by (tenantId, idempotencyKey).
   */
  async postEntry(input: PostEntryInput): Promise<PostedEntry> {
    this.validateStructure(input);

    // Idempotency — return existing if same key was already used.
    const existing = await this.db.ledgerEntry.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { id: existing.id, duplicate: true };

    // Look up all referenced accounts in one query; verify ownership + currency.
    const accountIds = input.postings.map((p) => p.accountId);
    const accounts = await this.db.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    for (const p of input.postings) {
      const acc = byId.get(p.accountId);
      if (!acc) {
        throw new LedgerError(`account ${p.accountId} not found`, 'ACCOUNT_NOT_FOUND');
      }
      if (acc.tenantId !== input.tenantId) {
        throw new LedgerError(
          `account ${p.accountId} belongs to a different tenant`,
          'ACCOUNT_CROSS_TENANT',
        );
      }
      if (acc.currency !== input.currency) {
        throw new LedgerError(
          `account ${p.accountId} currency ${acc.currency} does not match entry currency ${input.currency}`,
          'CURRENCY_MISMATCH',
        );
      }
      if (acc.status !== 'active') {
        throw new LedgerError(`account ${p.accountId} is not active`, 'ACCOUNT_INACTIVE');
      }
    }

    try {
      const entry = await this.db.$transaction(async (tx) => {
        const created = await tx.ledgerEntry.create({
          data: {
            tenantId: input.tenantId,
            currency: input.currency,
            description: input.description,
            idempotencyKey: input.idempotencyKey,
            sourceEventId: input.sourceEventId ?? null,
          },
        });

        await tx.ledgerPosting.createMany({
          data: input.postings.map((p) => ({
            entryId: created.id,
            accountId: p.accountId,
            amount: p.amount,
            currency: input.currency,
          })),
        });

        return created;
      });

      return { id: entry.id, duplicate: false };
    } catch (e: any) {
      // Race on idempotency key — re-resolve and return existing.
      if (e?.code === 'P2002') {
        const re = await this.db.ledgerEntry.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: input.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (re) return { id: re.id, duplicate: true };
      }
      throw e;
    }
  }

  private validateStructure(input: PostEntryInput): void {
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new LedgerError(`invalid currency: ${input.currency}`, 'BAD_CURRENCY');
    }
    if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
      throw new LedgerError('idempotencyKey must be at least 8 chars', 'BAD_IDEMPOTENCY_KEY');
    }
    if (input.postings.length < 2) {
      throw new LedgerError('entry must have at least 2 postings', 'TOO_FEW_POSTINGS');
    }

    let sum = 0n;
    for (const p of input.postings) {
      if (typeof p.amount !== 'bigint') {
        throw new LedgerError(
          `posting amount must be bigint, got ${typeof p.amount}`,
          'BAD_AMOUNT_TYPE',
        );
      }
      sum += p.amount;
    }
    if (sum !== 0n) {
      throw new LedgerError(`postings do not sum to zero (sum = ${sum})`, 'UNBALANCED_ENTRY');
    }
  }
}
