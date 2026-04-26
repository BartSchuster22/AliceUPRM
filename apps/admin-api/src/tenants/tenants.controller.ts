import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { prisma } from '@uprm/db';
import { IdentityService } from '@uprm/identity';
import { parseRewardConfig, RewardConfigError } from '@uprm/rewards';
import { TenantService } from '@uprm/tenants';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { UpdateTenantWebhookConfigDto } from './dto/update-tenant-webhook-config.dto';

@Controller('admin/tenants')
@UseGuards(AdminJwtGuard, RolesGuard)
export class TenantsController {
  private readonly svc = new TenantService();
  private readonly identity = new IdentityService();
  private readonly audit = new AuditService();

  @Post()
  @Roles('super_admin')
  async create(@Body() dto: CreateTenantDto, @Req() req: AdminRequestLike) {
    const root = await this.ensureRootProvenance();
    const sourceTenantId = dto.sourceTenantId ?? root.tenant.id;
    const sourceTenantUserId = dto.sourceTenantUserId ?? root.tenantUser.id;

    const tenant = await this.svc.createTenant({
      name: dto.name,
      slug: dto.slug,
      baseCurrency: dto.baseCurrency,
      sourceTenantId,
      sourceTenantUserId,
    });

    const ownerTenantUser = await this.identity.findOrCreateTenantUser({
      tenantId: tenant.id,
      email: dto.ownerEmail ?? `${dto.slug}@tenant.uprm.local`,
      externalUserId: dto.ownerExternalUserId ?? `tenant:${dto.slug}`,
      username: dto.ownerUsername ?? dto.name,
      entityType: 'tenant',
      sourceTenantId,
      sourceTenantUserId,
      metadata: {
        tenantEntity: true,
        tenantSlug: dto.slug,
      },
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { ownerTenantUserId: ownerTenantUser.id },
    });

    const hydratedTenant = await this.svc.getTenant(tenant.id);
    const apiKey = await this.svc.issueApiKey(tenant.id, [
      'events.write',
      'users.write',
    ]);

    const result = {
      tenant: hydratedTenant,
      owner_tenant_user: {
        id: ownerTenantUser.id,
        external_user_id: ownerTenantUser.externalUserId,
        username: ownerTenantUser.username,
        entity_type: ownerTenantUser.entityType,
        source_tenant_id: ownerTenantUser.sourceTenantId,
        source_tenant_user_id: ownerTenantUser.sourceTenantUserId,
      },
      api_key: {
        id: apiKey.id,
        key_prefix: apiKey.keyPrefix,
        plaintext_key: apiKey.plaintextKey,
        note: 'This plaintext key is shown ONCE. Store it immediately.',
      },
    };

    if (req.admin) {
      await this.audit.write({
        actor: req.admin,
        request: req,
        action: 'tenant.create',
        resourceType: 'tenant',
        resourceId: tenant.id,
        tenantId: tenant.id,
        after: result,
      });
    }

    return result;
  }

  private async ensureRootProvenance() {
    let tenant = await prisma.tenant.findUnique({ where: { slug: 'uprm' } });
    if (!tenant) {
      tenant = await this.svc.createTenant({
        name: 'UPRM',
        slug: 'uprm',
        baseCurrency: 'EUR',
        isSystemTenant: true,
      });
    }
    if (!tenant) {
      throw new Error('failed to ensure UPRM root tenant');
    }

    const tenantUser = await this.identity.findOrCreateTenantUser({
      tenantId: tenant.id,
      email: 'user0@uprm.local',
      externalUserId: 'user0',
      username: 'user0',
      entityType: 'system',
      metadata: {
        systemRoot: true,
      },
    });

    if (!tenant.ownerTenantUserId || !tenant.isSystemTenant) {
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          ownerTenantUserId: tenantUser.id,
          isSystemTenant: true,
        },
        include: { config: true },
      });
    }

    return { tenant, tenantUser };
  }

  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list() {
    return this.svc.listTenants();
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'support')
  async get(@Param('id') id: string) {
    const t = await this.svc.getTenant(id);
    if (!t) throw new NotFoundException('tenant not found');
    return t;
  }

  @Post(':id/config')
  @Roles('super_admin', 'tenant_admin')
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateTenantConfigDto,
    @Req() req: AdminRequestLike,
  ) {
    const before = await this.svc.getTenant(id);
    if (!before) throw new NotFoundException('tenant not found');

    const rewardConfig = dto.rewardConfig
      ? validateRewardConfig(dto.rewardConfig)
      : undefined;

    const config = await this.svc.updateConfig(id, {
      ...(rewardConfig ? { rewardConfig } : {}),
      ...(dto.promoterConfig ? { promoterConfig: dto.promoterConfig } : {}),
      ...(dto.fraudConfig ? { fraudConfig: dto.fraudConfig } : {}),
    });

    const result = {
      tenant_id: config.tenantId,
      reward_config: config.rewardConfig,
      promoter_config: config.promoterConfig,
      fraud_config: config.fraudConfig,
    };

    if (req.admin) {
      await this.audit.write({
        actor: req.admin,
        request: req,
        action: 'tenant.config.update',
        resourceType: 'tenant',
        resourceId: id,
        tenantId: id,
        before: before.config,
        after: result,
      });
    }

    return result;
  }

  @Post(':id/webhook-config')
  @Roles('super_admin', 'tenant_admin')
  async updateWebhookConfig(
    @Param('id') id: string,
    @Body() dto: UpdateTenantWebhookConfigDto,
    @Req() req: AdminRequestLike,
  ) {
    const before = await this.svc.getTenant(id);
    if (!before) throw new NotFoundException('tenant not found');

    const previousWebhookConfig =
      before.config &&
      typeof before.config === 'object' &&
      'webhookConfig' in before.config
        ? ((before.config as { webhookConfig?: Record<string, unknown> })
            .webhookConfig ?? {})
        : {};

    const nextWebhookConfig = {
      ...previousWebhookConfig,
      ...(dto.stripe
        ? {
            stripe: {
              enabled: dto.stripe.enabled,
              webhookSecret: dto.stripe.webhookSecret,
              mode: dto.stripe.mode,
              defaultCurrency: dto.stripe.defaultCurrency,
            },
          }
        : {}),
      ...(dto.outbound
        ? {
            outbound: {
              enabled: dto.outbound.enabled,
              endpoints: dto.outbound.endpoints.map((endpoint) => ({
                id: endpoint.id,
                url: endpoint.url,
                secret: endpoint.secret,
                eventTypes: endpoint.eventTypes,
              })),
            },
          }
        : {}),
    };

    const config = await this.svc.updateConfig(id, {
      webhookConfig: nextWebhookConfig,
    });

    const result = {
      tenant_id: config.tenantId,
      webhook_config: config.webhookConfig,
    };

    if (req.admin) {
      await this.audit.write({
        actor: req.admin,
        request: req,
        action: 'tenant.webhook_config.update',
        resourceType: 'tenant',
        resourceId: id,
        tenantId: id,
        before: before.config,
        after: result,
      });
    }

    return result;
  }
}

function validateRewardConfig(raw: Record<string, unknown>) {
  try {
    return parseRewardConfig(raw);
  } catch (error) {
    if (error instanceof RewardConfigError) {
      throw new BadRequestException({
        code: error.code,
        message: error.message,
      });
    }

    throw error;
  }
}
