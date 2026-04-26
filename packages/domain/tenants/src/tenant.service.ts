import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma, PrismaClient } from '@uprm/db';

export interface IssuedApiKey {
  id: string;
  keyPrefix: string;
  plaintextKey: string;
}

export interface HmacSignedRequest {
  method: string;
  path: string;
  body: string;
  header: string;
}

export interface VerifiedTenant {
  tenantId: string;
  apiKeyId: string;
}

export interface CheckoutProductConfig {
  ref: string;
  name: string;
  plan: string;
  productDescription?: string;
  priceDescription?: string;
  amountMinor: number;
  currency: string;
  billingInterval: 'month' | 'year';
  active: boolean;
}

export class TenantAuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'TenantAuthError';
  }
}

const SKEW_SECONDS = 300;

export class TenantService {
  constructor(private db: PrismaClient = prisma) {}

  async createTenant(input: {
    name: string;
    slug: string;
    baseCurrency?: string;
    ownerTenantUserId?: string;
    sourceTenantId?: string;
    sourceTenantUserId?: string;
    isSystemTenant?: boolean;
  }): Promise<any> {
    return this.db.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        baseCurrency: input.baseCurrency ?? 'EUR',
        ownerTenantUserId: input.ownerTenantUserId ?? null,
        sourceTenantId: input.sourceTenantId ?? null,
        sourceTenantUserId: input.sourceTenantUserId ?? null,
        isSystemTenant: input.isSystemTenant ?? false,
        config: { create: {} },
      },
      include: { config: true },
    });
  }

  async getTenant(id: string): Promise<any> {
    const tenant = await this.db.tenant.findUnique({
      where: { id },
      include: { config: true },
    });
    if (!tenant) {
      return null;
    }
    const activePromoters = await this.db.promoterProfile.findMany({
      where: { tenantId: id, effectiveTo: null },
      orderBy: [{ effectiveFrom: 'desc' }],
    } as any);
    const tenantUsers = await this.db.tenantUser.findMany({
      where: { id: { in: activePromoters.map((profile: any) => profile.tenantUserId) } },
      select: {
        id: true,
        username: true,
        externalUserId: true,
      },
    } as any);
    const tenantUserById = new Map(tenantUsers.map((row: any) => [row.id, row]));
    return {
      ...tenant,
      activePromoters: activePromoters.map((profile: any) => ({
        ...profile,
        tenantUser: tenantUserById.get(profile.tenantUserId) ?? null,
      })),
    };
  }

  async listTenants(): Promise<any[]> {
    const tenants = await this.db.tenant.findMany({
      include: { config: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    const activePromoters = await this.db.promoterProfile.findMany({
      where: { effectiveTo: null },
      orderBy: [{ effectiveFrom: 'desc' }],
    } as any);
    const tenantUsers = await this.db.tenantUser.findMany({
      where: { id: { in: activePromoters.map((profile: any) => profile.tenantUserId) } },
      select: {
        id: true,
        username: true,
        externalUserId: true,
      },
    } as any);
    const tenantUserById = new Map(tenantUsers.map((row: any) => [row.id, row]));
    const byTenant = new Map<string, any[]>();
    for (const profile of activePromoters) {
      byTenant.set(profile.tenantId, [
        ...(byTenant.get(profile.tenantId) ?? []),
        {
          ...profile,
          tenantUser: tenantUserById.get(profile.tenantUserId) ?? null,
        },
      ]);
    }
    return tenants.map((tenant) => ({
      ...tenant,
      activePromoters: byTenant.get(tenant.id) ?? [],
    }));
  }

  async updateConfig(
    tenantId: string,
    input: Partial<{
      rewardConfig: unknown;
      promoterConfig: unknown;
      fraudConfig: unknown;
      webhookConfig: unknown;
    }>,
  ): Promise<any> {
    return this.db.tenantConfig.update({
      where: { tenantId },
      data: input as any,
    });
  }

  async registerCheckoutProduct(
    tenantId: string,
    input: Omit<CheckoutProductConfig, 'plan' | 'active'> & {
      plan?: string;
      active?: boolean;
    },
  ): Promise<CheckoutProductConfig> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('tenant not found');
    }

    const previousWebhookConfig = asRecord(tenant.config?.webhookConfig);
    const checkoutCatalog = asRecord(previousWebhookConfig.checkoutCatalog);
    const existingProducts = parseCheckoutProducts(checkoutCatalog.products);

    const nextProduct: CheckoutProductConfig = {
      ref: input.ref,
      name: input.name,
      plan: input.plan ?? input.ref,
      ...(input.productDescription ? { productDescription: input.productDescription } : {}),
      ...(input.priceDescription ? { priceDescription: input.priceDescription } : {}),
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      billingInterval: input.billingInterval,
      active: input.active ?? true,
    };

    const nextProducts = [
      ...existingProducts.filter((product) => product.ref !== input.ref),
      nextProduct,
    ].sort((a, b) => a.ref.localeCompare(b.ref));

    await this.updateConfig(tenantId, {
      webhookConfig: {
        ...previousWebhookConfig,
        checkoutCatalog: {
          ...checkoutCatalog,
          products: nextProducts,
        },
      },
    });

    return nextProduct;
  }

  async getCheckoutProduct(
    tenantId: string,
    productRef: string,
  ): Promise<CheckoutProductConfig | null> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      return null;
    }

    const previousWebhookConfig = asRecord(tenant.config?.webhookConfig);
    const checkoutCatalog = asRecord(previousWebhookConfig.checkoutCatalog);
    const products = parseCheckoutProducts(checkoutCatalog.products);
    const match = products.find((product) => product.ref === productRef && product.active);
    return match ?? null;
  }

  async issueApiKey(tenantId: string, scopes: string[] = []): Promise<IssuedApiKey> {
    const keyPrefix = randomBytes(4).toString('hex');
    const keyBody = randomBytes(32).toString('hex');
    const plaintextKey = `${keyPrefix}.${keyBody}`;
    const keyHash = createHash('sha256').update(plaintextKey).digest('hex');

    const record = await this.db.tenantApiKey.create({
      data: { tenantId, keyHash, keyPrefix, scopes, status: 'active' },
    });

    return { id: record.id, keyPrefix, plaintextKey };
  }

  async revokeApiKey(apiKeyId: string) {
    return this.db.tenantApiKey.update({
      where: { id: apiKeyId },
      data: { status: 'revoked' },
    });
  }

  async verifySignedRequest(
    req: HmacSignedRequest,
    nowSec = Math.floor(Date.now() / 1000),
  ): Promise<VerifiedTenant> {
    const match = req.header.match(/^UPRM-HMAC\s+([a-f0-9]{8}):(\d+):([a-f0-9]{64})$/i);
    if (!match) throw new TenantAuthError('malformed Authorization header', 'MALFORMED');

    const keyPrefix = match[1] as string;
    const tsStr = match[2] as string;
    const providedSigHex = match[3] as string;

    const ts = Number(tsStr);
    if (!Number.isFinite(ts)) throw new TenantAuthError('invalid timestamp', 'BAD_TS');
    if (Math.abs(nowSec - ts) > SKEW_SECONDS)
      throw new TenantAuthError('timestamp outside skew window', 'SKEW');

    const apiKey = await this.db.tenantApiKey.findUnique({ where: { keyPrefix } });
    if (!apiKey || apiKey.status !== 'active')
      throw new TenantAuthError('key not found or revoked', 'KEY_INVALID');

    const canonical = [
      ts.toString(),
      req.method.toUpperCase(),
      req.path,
      createHash('sha256').update(req.body).digest('hex'),
    ].join('\n');

    const expectedSigHex = createHmac('sha256', apiKey.keyHash).update(canonical).digest('hex');

    const a = Buffer.from(providedSigHex, 'hex');
    const b = Buffer.from(expectedSigHex, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new TenantAuthError('signature mismatch', 'SIG_MISMATCH');
    }

    await this.db.tenantApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return { tenantId: apiKey.tenantId, apiKeyId: apiKey.id };
  }

  static signRequest(
    keyHash: string,
    keyPrefix: string,
    method: string,
    path: string,
    body: string,
    tsSec = Math.floor(Date.now() / 1000),
  ) {
    const canonical = [
      tsSec.toString(),
      method.toUpperCase(),
      path,
      createHash('sha256').update(body).digest('hex'),
    ].join('\n');
    const sig = createHmac('sha256', keyHash).update(canonical).digest('hex');
    return { header: `UPRM-HMAC ${keyPrefix}:${tsSec}:${sig}`, tsSec };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseCheckoutProducts(value: unknown): CheckoutProductConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return [];
    }

    const row = entry as Record<string, unknown>;
    if (
      typeof row.ref !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.plan !== 'string' ||
      typeof row.amountMinor !== 'number' ||
      typeof row.currency !== 'string' ||
      (row.billingInterval !== 'month' && row.billingInterval !== 'year') ||
      typeof row.active !== 'boolean'
    ) {
      return [];
    }

    return [
      {
        ref: row.ref,
        name: row.name,
        plan: row.plan,
        ...(typeof row.productDescription === 'string'
          ? { productDescription: row.productDescription }
          : {}),
        ...(typeof row.priceDescription === 'string'
          ? { priceDescription: row.priceDescription }
          : {}),
        amountMinor: row.amountMinor,
        currency: row.currency.toUpperCase(),
        billingInterval: row.billingInterval,
        active: row.active,
      } satisfies CheckoutProductConfig,
    ];
  });
}
