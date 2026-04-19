import { prisma, PrismaClient } from '@uprm/db';

export class IdentityError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'IdentityError';
  }
}

export function normaliseEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    throw new IdentityError('invalid email', 'BAD_EMAIL');
  }
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plusAt = local.indexOf('+');
  if (plusAt !== -1) local = local.slice(0, plusAt);

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

export interface CreateUserInput {
  tenantId: string;
  email: string;
  externalUserId: string;
  username?: string;
  metadata?: Record<string, unknown>;
}

export class IdentityService {
  constructor(private db: PrismaClient = prisma) {}

  async findOrCreateTenantUser(input: CreateUserInput): Promise<any> {
    const email = normaliseEmail(input.email);

    const existing = await this.db.tenantUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId: input.tenantId,
          externalUserId: input.externalUserId,
        },
      },
      include: { user: true },
    });
    if (existing) return existing;

    return this.db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { emailNormalized: email },
        update: {},
        create: { emailNormalized: email },
      });

      return tx.tenantUser.create({
        data: {
          tenantId: input.tenantId,
          userId: user.id,
          externalUserId: input.externalUserId,
          username: input.username ?? null,
          metadata: (input.metadata ?? {}) as any,
        },
        include: { user: true },
      });
    });
  }

  async getTenantUser(tenantId: string, tenantUserId: string): Promise<any> {
    return this.db.tenantUser.findFirst({
      where: { id: tenantUserId, tenantId },
      include: { user: true },
    });
  }
}
