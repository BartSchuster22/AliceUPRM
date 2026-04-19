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

  async createTenant(input: { name: string; slug: string; baseCurrency?: string }): Promise<any> {
    return this.db.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        baseCurrency: input.baseCurrency ?? 'EUR',
        config: { create: {} },
      },
      include: { config: true },
    });
  }

  async getTenant(id: string): Promise<any> {
    return this.db.tenant.findUnique({
      where: { id },
      include: { config: true },
    });
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
