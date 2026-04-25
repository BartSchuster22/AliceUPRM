import { prisma, PrismaClient } from '@uprm/db';

export interface TenantUserProfileSummary {
  userId: string;
  email: string;
  fullName: string;
  referralCode: string | null;
  emailVerified: boolean;
  userStatus: string;
  profileId: string | null;
  accountType: 'private' | 'business' | null;
  companyName: string | null;
  taxId: string | null;
  phone: string | null;
  country: string | null;
  onboardingState: string | null;
}

export interface TenantUserSubscriptionSummary {
  externalSubscriptionId: string;
  status: string;
  plan: string;
  amountMinor: number;
  currency: string;
  startedAt: string;
  cancelledAt: string | null;
}

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
  entityType?: 'person' | 'tenant' | 'system';
  sourceTenantId?: string;
  sourceTenantUserId?: string;
  metadata?: Record<string, unknown>;
}

export class IdentityService {
  constructor(private db: PrismaClient = prisma) {}

  async findOrCreateTenantUser(input: CreateUserInput): Promise<any> {
    const email = normaliseEmail(input.email);
    const entityType = input.entityType ?? 'person';

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

    let sourceTenantId = input.sourceTenantId;
    let sourceTenantUserId = input.sourceTenantUserId;

    if (entityType !== 'system') {
      if (!sourceTenantUserId) {
        throw new IdentityError(
          'source tenant user is required for non-system users',
          'SOURCE_REQUIRED',
        );
      }

      const sourceTenantUser = await this.db.tenantUser.findFirst({
        where: { id: sourceTenantUserId },
        include: { user: true },
      });
      if (!sourceTenantUser) {
        throw new IdentityError('source tenant user not found', 'SOURCE_NOT_FOUND');
      }

      if (sourceTenantId && sourceTenantId !== sourceTenantUser.tenantId) {
        throw new IdentityError(
          'source tenant does not match source user tenant',
          'SOURCE_MISMATCH',
        );
      }

      sourceTenantId = sourceTenantUser.tenantId;
    }

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
          entityType,
          sourceTenantId: sourceTenantId ?? null,
          sourceTenantUserId: sourceTenantUserId ?? null,
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

  async getTenantUserByExternalUserId(tenantId: string, externalUserId: string): Promise<any> {
    return this.db.tenantUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId,
        },
      },
      include: { user: true },
    });
  }

  async getProfileByExternalUserId(
    tenantId: string,
    externalUserId: string,
  ): Promise<TenantUserProfileSummary | null> {
    const tenantUser = await this.db.tenantUser.findUnique({
      where: {
        tenantId_externalUserId: {
          tenantId,
          externalUserId,
        },
      },
      include: { user: true },
    });

    if (!tenantUser) {
      return null;
    }

    const referralCode = await this.db.referralCode.findFirst({
      where: {
        tenantId,
        tenantUserId: tenantUser.id,
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });

    const metadata = asRecord(tenantUser.metadata);
    const accountType = metadata?.accountType;

    return {
      userId: tenantUser.externalUserId,
      email: tenantUser.user.emailNormalized,
      fullName: tenantUser.username ?? tenantUser.user.emailNormalized,
      referralCode: referralCode?.code ?? null,
      emailVerified: tenantUser.user.emailVerified,
      userStatus: tenantUser.tenantStatus,
      profileId: null,
      accountType: accountType === 'private' || accountType === 'business' ? accountType : null,
      companyName: asNullableString(metadata?.companyName),
      taxId: asNullableString(metadata?.taxId),
      phone: asNullableString(metadata?.phone),
      country: asNullableString(metadata?.country),
      onboardingState: asNullableString(metadata?.onboardingState),
    };
  }

  async getSubscriptionSummariesByExternalUserId(
    tenantId: string,
    externalUserId: string,
  ): Promise<TenantUserSubscriptionSummary[]> {
    const events = await this.db.ingestedEvent.findMany({
      where: {
        tenantId,
        externalUserId,
        eventType: {
          in: ['subscription_started', 'subscription_cancelled'],
        },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        eventType: true,
        occurredAt: true,
        payload: true,
      },
    });

    const subscriptions = new Map<string, TenantUserSubscriptionSummary>();

    for (const event of events) {
      const payload = asRecord(event.payload);
      const externalSubscriptionId = asNullableString(payload?.subscriptionId);
      if (!externalSubscriptionId) {
        continue;
      }

      if (event.eventType === 'subscription_started') {
        subscriptions.set(externalSubscriptionId, {
          externalSubscriptionId,
          status: 'active',
          plan: asNullableString(payload?.plan) ?? 'unknown',
          amountMinor: parseAmountMinor(payload?.amount),
          currency: (asNullableString(payload?.currency) ?? 'EUR').toUpperCase(),
          startedAt: event.occurredAt.toISOString(),
          cancelledAt: null,
        });
        continue;
      }

      const existing = subscriptions.get(externalSubscriptionId);
      if (!existing) {
        subscriptions.set(externalSubscriptionId, {
          externalSubscriptionId,
          status: 'cancelled',
          plan: 'unknown',
          amountMinor: 0,
          currency: 'EUR',
          startedAt: event.occurredAt.toISOString(),
          cancelledAt: event.occurredAt.toISOString(),
        });
        continue;
      }

      subscriptions.set(externalSubscriptionId, {
        ...existing,
        status: 'cancelled',
        cancelledAt: event.occurredAt.toISOString(),
      });
    }

    return Array.from(subscriptions.values()).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseAmountMinor(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }
  return 0;
}
