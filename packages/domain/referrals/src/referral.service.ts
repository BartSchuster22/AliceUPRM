import { randomBytes } from 'node:crypto';
import { prisma, PrismaClient } from '@uprm/db';

export class ReferralError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'ReferralError';
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // base32, no 0/O/1/I

function generateCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

export interface CreateCodeInput {
  tenantId: string;
  tenantUserId: string;
  expiresAt?: Date;
}

export interface ApplyCodeInput {
  tenantId: string;
  referredTenantUserId: string;
  code: string;
}

export class ReferralService {
  constructor(private db: PrismaClient = prisma) {}

  /**
   * Create a unique code for a tenant-user. Retries up to 5 times on collision.
   */
  async createCode(input: CreateCodeInput): Promise<any> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode(10);
      try {
        return await this.db.referralCode.create({
          data: {
            tenantId: input.tenantId,
            tenantUserId: input.tenantUserId,
            code,
            expiresAt: input.expiresAt ?? null,
          },
        });
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < 4) continue; // unique collision, retry
        throw e;
      }
    }
    throw new ReferralError('code generation exhausted retries', 'CODE_EXHAUSTED');
  }

  async resolveCode(tenantId: string, code: string): Promise<any> {
    return this.db.referralCode.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
  }

  /**
   * Apply a referral code to a tenant user.
   * - Self-referral rejected
   * - Cycle detection (referrer must not already be a descendant of referred)
   * - Idempotent before edge is locked
   * - Locked edges cannot be reassigned
   */
  async applyCode(input: ApplyCodeInput): Promise<any> {
    const code = await this.resolveCode(input.tenantId, input.code);
    if (!code || code.status !== 'active') {
      throw new ReferralError('code not found or inactive', 'CODE_NOT_FOUND');
    }
    if (code.expiresAt && code.expiresAt.getTime() < Date.now()) {
      throw new ReferralError('code expired', 'CODE_EXPIRED');
    }

    const referrerId = code.tenantUserId;
    if (referrerId === input.referredTenantUserId) {
      throw new ReferralError('self-referral not allowed', 'SELF_REFERRAL');
    }

    // Cycle protection: walk up the ancestry of the REFERRER.
    // If the referred user appears anywhere in that chain, it's a cycle.
    const ancestryOfReferrer = await this.db.referralAncestry.findMany({
      where: { tenantId: input.tenantId, descendantTenantUserId: referrerId },
      select: { ancestorTenantUserId: true },
    });
    if (ancestryOfReferrer.some((a) => a.ancestorTenantUserId === input.referredTenantUserId)) {
      throw new ReferralError('cycle detected', 'CYCLE');
    }

    const existing = await this.db.referralEdge.findUnique({
      where: {
        tenantId_referredTenantUserId: {
          tenantId: input.tenantId,
          referredTenantUserId: input.referredTenantUserId,
        },
      },
    });
    if (existing) {
      if (existing.lockedAt) {
        throw new ReferralError('referral is locked and cannot be changed', 'LOCKED');
      }
      if (existing.referrerTenantUserId === referrerId) {
        return existing; // idempotent
      }
      // not locked yet, allow reassignment to a different referrer
      return this.db.$transaction(async (tx) => {
        await tx.referralEdge.delete({ where: { id: existing.id } });
        await tx.referralAncestry.deleteMany({
          where: {
            tenantId: input.tenantId,
            descendantTenantUserId: input.referredTenantUserId,
          },
        });
        return this.createEdgeWithAncestry(tx, input, referrerId, code.id);
      });
    }

    return this.db.$transaction(async (tx) => {
      return this.createEdgeWithAncestry(tx, input, referrerId, code.id);
    });
  }

  /**
   * Lock an edge (called when the first paid conversion happens).
   */
  async lockEdge(tenantId: string, referredTenantUserId: string): Promise<any> {
    return this.db.referralEdge.update({
      where: {
        tenantId_referredTenantUserId: {
          tenantId,
          referredTenantUserId,
        },
      },
      data: { lockedAt: new Date() },
    });
  }

  async getReferralTree(
    tenantId: string,
    ancestorTenantUserId: string,
    maxDepth = 2,
  ): Promise<any[]> {
    return this.db.referralAncestry.findMany({
      where: {
        tenantId,
        ancestorTenantUserId,
        depth: { gt: 0, lte: maxDepth },
      },
      orderBy: [{ depth: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // ------------------------------------------------------------
  // Internal helpers

  private async createEdgeWithAncestry(
    tx: any,
    input: ApplyCodeInput,
    referrerId: string,
    sourceCodeId: string,
  ) {
    const edge = await tx.referralEdge.create({
      data: {
        tenantId: input.tenantId,
        referrerTenantUserId: referrerId,
        referredTenantUserId: input.referredTenantUserId,
        sourceCodeId,
        attributionMethod: 'code',
      },
    });

    // Ancestry: self-edge at depth 0 + referrer-chain + (referrer's ancestors + 1)
    const rows: { ancestorTenantUserId: string; depth: number }[] = [
      { ancestorTenantUserId: input.referredTenantUserId, depth: 0 },
      { ancestorTenantUserId: referrerId, depth: 1 },
    ];

    const referrerAncestors = await tx.referralAncestry.findMany({
      where: {
        tenantId: input.tenantId,
        descendantTenantUserId: referrerId,
        depth: { gt: 0 },
      },
    });
    for (const a of referrerAncestors) {
      rows.push({ ancestorTenantUserId: a.ancestorTenantUserId, depth: a.depth + 1 });
    }

    await tx.referralAncestry.createMany({
      data: rows.map((r) => ({
        tenantId: input.tenantId,
        ancestorTenantUserId: r.ancestorTenantUserId,
        descendantTenantUserId: input.referredTenantUserId,
        depth: r.depth,
      })),
      skipDuplicates: true,
    });

    return edge;
  }
}
