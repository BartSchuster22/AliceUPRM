import {
  BadRequestException,
  ConflictException,
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StripeCheckoutService } from '@uprm/payments';
import { TenantService } from '@uprm/tenants';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('v1/billing')
@UseGuards(HmacAuthGuard)
export class BillingController {
  private readonly tenantSvc = new TenantService();
  private readonly payments = new StripeCheckoutService();

  @Post('checkout-sessions')
  async createCheckoutSession(
    @Body() dto: CreateCheckoutSessionDto,
    @Req() req: any,
  ) {
    const tenantId: string = req.uprm.tenantId;
    const tenant = await this.tenantSvc.getTenant(tenantId);

    if (!tenant) {
      throw new BadRequestException('tenant not found');
    }

    const stripeConfig = tenant.config?.webhookConfig?.stripe;
    if (!stripeConfig?.enabled) {
      throw new ConflictException(
        'stripe checkout is not enabled for this tenant',
      );
    }

    const tenantCurrency = tenant.baseCurrency?.toUpperCase();
    const requestedCurrency = dto.currency.toUpperCase();
    if (tenantCurrency && tenantCurrency !== requestedCurrency) {
      throw new BadRequestException(
        `tenant base currency is ${tenantCurrency}, got ${requestedCurrency}`,
      );
    }

    return this.payments
      .createCheckoutSession({
        externalUserId: dto.externalUserId,
        plan: dto.plan,
        productName: dto.productName,
        ...(dto.productDescription
          ? { productDescription: dto.productDescription }
          : {}),
        amountMinor: dto.amountMinor,
        currency: requestedCurrency,
        billingInterval: dto.billingInterval,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
        ...(dto.referralCodeUsed
          ? { referralCodeUsed: dto.referralCodeUsed }
          : {}),
      })
      .catch((error: Error) => {
        if (error.message === 'STRIPE_SECRET_KEY is required') {
          throw new ConflictException(
            'stripe checkout provider is not configured',
          );
        }
        throw error;
      });
  }
}
