import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { prisma } from '@uprm/db';
import { WebhookDeliveryService } from '@uprm/webhooks';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListWebhookDeliveriesQueryDto } from './dto/list-webhook-deliveries-query.dto';

@Controller('admin/webhook-deliveries')
@UseGuards(AdminJwtGuard, RolesGuard)
export class WebhookDeliveriesController {
  private readonly deliveries = new WebhookDeliveryService();
  private readonly audit = new AuditService();
  private readonly db = prisma;

  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list(@Query() query: ListWebhookDeliveriesQueryDto) {
    const rows = await this.deliveries.listDeliveries({
      tenantId: query.tenantId,
      status: query.status,
      eventType: query.eventType,
    });

    return rows.map((row: any) => this.mapDeliveryRow(row));
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'support')
  async detail(@Param('id') id: string) {
    const delivery = await this.deliveries.getDelivery(id);
    if (!delivery) {
      throw new NotFoundException('webhook delivery not found');
    }

    return this.buildDeliveryDetail(delivery as any);
  }

  @Post(':id/replay')
  @Roles('super_admin', 'tenant_admin', 'support')
  async replay(@Param('id') id: string, @Req() req: AdminRequestLike) {
    let replayed;
    try {
      replayed = await this.deliveries.replayDelivery(id);
    } catch (error: any) {
      if ((error?.message ?? '').includes('not found')) {
        throw new NotFoundException('webhook delivery not found');
      }
      throw error;
    }

    if (req.admin) {
      await this.audit.write({
        actor: req.admin,
        request: req,
        action: 'webhook.delivery.replay',
        resourceType: 'webhook_delivery',
        resourceId: id,
        tenantId: (replayed as any).tenantId ?? null,
        after: replayed,
      });
    }

    return {
      id: (replayed as any).id,
      status: (replayed as any).status,
      tenant_id: (replayed as any).tenantId,
      event_type: (replayed as any).eventType,
      endpoint_url: (replayed as any).endpointUrl,
    };
  }

  private mapDeliveryRow(row: any) {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      event_type: row.eventType,
      endpoint_url: row.endpointUrl,
      status: row.status,
      attempt_count: row.attemptCount,
      next_attempt_at: row.nextAttemptAt,
      last_attempt_at: row.lastAttemptAt,
      delivered_at: row.deliveredAt,
      last_status_code: row.lastStatusCode,
      last_error: row.lastError,
      source_topic: row.sourceTopic,
      source_event_id: row.sourceEventId,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  private async buildDeliveryDetail(row: any) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: row.tenantId },
      select: { id: true, name: true, slug: true, status: true },
    });

    const payloadRoot = this.asRecord(row.payload);
    const payload = this.asRecord(payloadRoot.payload);
    const tenantUserIds = Array.from(
      new Set(
        [
          this.readString(payload, 'tenantUserId'),
          this.readString(payload, 'beneficiaryTenantUserId'),
          this.readString(payload, 'referredTenantUserId'),
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    const users = tenantUserIds.length
      ? await this.db.tenantUser.findMany({
          where: { id: { in: tenantUserIds } },
          include: { user: true },
        })
      : [];

    const usersInvolved = tenantUserIds.map((tenantUserId) => {
      const match = users.find((user) => user.id === tenantUserId);
      return {
        tenant_user_id: tenantUserId,
        username: match?.username ?? null,
        external_user_id: match?.externalUserId ?? null,
        email: match?.user.emailNormalized ?? null,
      };
    });

    return {
      ...this.mapDeliveryRow(row),
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
          }
        : null,
      users_involved: usersInvolved,
      balance_minor:
        this.readString(payload, 'amountMinor') ??
        this.readString(payload, 'deltaMinor') ??
        null,
      currency: this.readString(payload, 'currency') ?? null,
      payload,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(
    record: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }
}
