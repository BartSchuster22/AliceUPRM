import {
  BadRequestException,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { EventIngestionService } from '@uprm/events';
import { StripeWebhookService } from '@uprm/payments';
import { TenantService } from '@uprm/tenants';

@Controller('admin/webhooks/stripe')
export class StripeWebhooksController {
  private readonly tenants = new TenantService();
  private readonly payments = new StripeWebhookService();
  private readonly events = new EventIngestionService();

  @Post(':tenantId')
  async handle(@Param('tenantId') tenantId: string, @Req() req: any) {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !signature) {
      throw new BadRequestException('missing stripe-signature header');
    }

    const tenant = await this.tenants.getTenant(tenantId);
    if (!tenant) {
      throw new NotFoundException('tenant not found');
    }

    const stripeConfig = tenant.config?.webhookConfig?.stripe;
    if (!stripeConfig?.enabled || !stripeConfig.webhookSecret) {
      throw new ConflictException(
        'stripe webhook config is not enabled for this tenant',
      );
    }

    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body ?? {}));

    const normalized = await this.payments.constructAndNormalize({
      rawBody,
      signature,
      webhookSecret: stripeConfig.webhookSecret,
    });

    if (!normalized) {
      return { ignored: true };
    }

    const result = await this.events.ingest({
      tenantId,
      body: normalized,
    });

    return {
      event_id: result.eventId,
      processing_status: result.processingStatus,
      duplicate: result.duplicate,
      ignored: false,
    };
  }
}
