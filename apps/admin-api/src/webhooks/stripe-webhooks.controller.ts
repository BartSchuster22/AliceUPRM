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
import { WalletRedemptionService } from '@uprm/wallet';

@Controller('admin/webhooks/stripe')
export class StripeWebhooksController {
  private readonly tenants = new TenantService();
  private readonly payments = new StripeWebhookService();
  private readonly events = new EventIngestionService();
  private readonly walletRedemptions = new WalletRedemptionService();

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

    let normalizedResult;
    try {
      const paymentsAny = this.payments as any;
      if (typeof paymentsAny.constructAndNormalizeWithEvent === 'function') {
        normalizedResult = await paymentsAny.constructAndNormalizeWithEvent({
          rawBody,
          signature,
          webhookSecret: stripeConfig.webhookSecret,
          tenantId,
        });
      } else {
        normalizedResult = {
          event: null,
          normalized: await paymentsAny.constructAndNormalize({
            rawBody,
            signature,
            webhookSecret: stripeConfig.webhookSecret,
            tenantId,
          }),
        };
      }
    } catch (error: any) {
      if (error?.type === 'StripeSignatureVerificationError') {
        throw new BadRequestException('invalid stripe signature');
      }
      throw error;
    }

    const lifecycle = extractWalletRedemptionLifecycle(normalizedResult.event);
    if (!normalizedResult.normalized) {
      if (lifecycle?.action === 'release') {
        await this.walletRedemptions.releaseRedemption(
          lifecycle.walletRedemptionId,
        );
        return {
          ignored: false,
          released: true,
          walletRedemptionId: lifecycle.walletRedemptionId,
        };
      }

      return { ignored: true };
    }

    const result = await this.events.ingest({
      tenantId,
      body: normalizedResult.normalized,
    });

    if (lifecycle?.action === 'mark_posted') {
      await this.walletRedemptions.markPosted(lifecycle.walletRedemptionId);
    }

    return {
      event_id: result.eventId,
      processing_status: result.processingStatus,
      duplicate: result.duplicate,
      ignored: false,
    };
  }
}

function extractWalletRedemptionLifecycle(
  event: any,
): { walletRedemptionId: string; action: 'mark_posted' | 'release' } | null {
  const walletRedemptionId = event?.data?.object?.metadata?.walletRedemptionId;
  if (
    typeof walletRedemptionId !== 'string' ||
    walletRedemptionId.length === 0
  ) {
    return null;
  }

  if (event?.type === 'checkout.session.completed') {
    return { walletRedemptionId, action: 'mark_posted' };
  }

  if (event?.type === 'checkout.session.expired') {
    return { walletRedemptionId, action: 'release' };
  }

  return null;
}
