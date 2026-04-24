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

  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list(@Query() query: ListWebhookDeliveriesQueryDto) {
    const rows = await this.deliveries.listDeliveries({
      tenantId: query.tenantId,
      status: query.status,
      eventType: query.eventType,
    });

    return rows.map((row: any) => ({
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
    }));
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
}
