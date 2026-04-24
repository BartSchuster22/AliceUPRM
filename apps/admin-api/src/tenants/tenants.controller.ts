import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from '@uprm/tenants';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantWebhookConfigDto } from './dto/update-tenant-webhook-config.dto';

@Controller('admin/tenants')
@UseGuards(AdminJwtGuard, RolesGuard)
export class TenantsController {
  private readonly svc = new TenantService();
  private readonly audit = new AuditService();

  @Post()
  @Roles('super_admin')
  async create(@Body() dto: CreateTenantDto, @Req() req: AdminRequestLike) {
    const tenant = await this.svc.createTenant({
      name: dto.name,
      slug: dto.slug,
      baseCurrency: dto.baseCurrency,
    });
    const apiKey = await this.svc.issueApiKey(tenant.id, [
      'events.write',
      'users.write',
    ]);

    const result = {
      tenant,
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
        after: { tenant },
      });
    }

    return result;
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

  @Post(':id/webhook-config')
  @Roles('super_admin', 'tenant_admin')
  async updateWebhookConfig(
    @Param('id') id: string,
    @Body() dto: UpdateTenantWebhookConfigDto,
    @Req() req: AdminRequestLike,
  ) {
    const before = await this.svc.getTenant(id);
    if (!before) throw new NotFoundException('tenant not found');

    const config = await this.svc.updateConfig(id, {
      webhookConfig: {
        stripe: {
          enabled: dto.stripe.enabled,
          webhookSecret: dto.stripe.webhookSecret,
          mode: dto.stripe.mode,
          defaultCurrency: dto.stripe.defaultCurrency,
        },
      },
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
