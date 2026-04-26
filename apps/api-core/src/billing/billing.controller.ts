import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StripeCheckoutService } from '@uprm/payments';
import { TenantService } from '@uprm/tenants';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { BillingCreditService } from './billing-credit.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ReleaseCheckoutReservationDto } from './dto/release-checkout-reservation.dto';

@Controller('v1/billing')
@UseGuards(HmacAuthGuard)
export class BillingController {
  private readonly tenantSvc = new TenantService();
  private readonly payments = new StripeCheckoutService();
  private readonly billingCredits = new BillingCreditService();

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

    const registeredProduct = dto.productRef
      ? await this.tenantSvc.getCheckoutProduct(tenantId, dto.productRef)
      : null;

    if (dto.productRef && !registeredProduct) {
      throw new NotFoundException(
        `checkout product not found for ref ${dto.productRef}`,
      );
    }

    const resolvedPlan = registeredProduct?.plan ?? dto.plan;
    const resolvedProductName = registeredProduct?.name ?? dto.productName;
    const resolvedProductDescription =
      registeredProduct?.productDescription ??
      registeredProduct?.priceDescription ??
      dto.productDescription;
    const resolvedAmountMinor =
      registeredProduct?.amountMinor ?? dto.amountMinor;
    const resolvedCurrency = (
      registeredProduct?.currency ?? dto.currency
    )?.toUpperCase();
    const resolvedBillingInterval =
      registeredProduct?.billingInterval ?? dto.billingInterval;

    if (
      !resolvedPlan ||
      !resolvedProductName ||
      resolvedAmountMinor == null ||
      !resolvedCurrency ||
      !resolvedBillingInterval
    ) {
      throw new BadRequestException(
        'checkout request is missing required product pricing fields',
      );
    }

    const tenantCurrency = tenant.baseCurrency?.toUpperCase();
    if (tenantCurrency && tenantCurrency !== resolvedCurrency) {
      throw new BadRequestException(
        `tenant base currency is ${tenantCurrency}, got ${resolvedCurrency}`,
      );
    }

    const billingCredits = await this.billingCredits.prepareCheckout({
      tenantId,
      externalUserId: dto.externalUserId,
      amountMinor: resolvedAmountMinor,
      applyCredits: dto.applyCredits,
      creditsToUse: dto.creditsToUse,
    });

    return this.payments
      .createCheckoutSession({
        externalUserId: dto.externalUserId,
        plan: resolvedPlan,
        productName: resolvedProductName,
        ...(resolvedProductDescription
          ? { productDescription: resolvedProductDescription }
          : {}),
        amountMinor: billingCredits.adjustedAmountMinor,
        currency: resolvedCurrency,
        billingInterval: resolvedBillingInterval,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
        ...(dto.referralCodeUsed
          ? { referralCodeUsed: dto.referralCodeUsed }
          : {}),
        ...(billingCredits.appliedCredits !== undefined
          ? { appliedCredits: billingCredits.appliedCredits }
          : {}),
        ...(billingCredits.walletRedemptionId
          ? { walletRedemptionId: billingCredits.walletRedemptionId }
          : {}),
        ...(billingCredits.tenantUserId
          ? { tenantUserId: billingCredits.tenantUserId }
          : {}),
        ...(billingCredits.userId ? { userId: billingCredits.userId } : {}),
      })
      .then((session) => ({
        ...session,
        ...(billingCredits.walletRedemptionId
          ? { walletRedemptionId: billingCredits.walletRedemptionId }
          : {}),
        ...(billingCredits.appliedCredits !== undefined
          ? { appliedCredits: billingCredits.appliedCredits }
          : {}),
      }))
      .catch((error: Error) => {
        if (error.message === 'STRIPE_SECRET_KEY is required') {
          throw new ConflictException(
            'stripe checkout provider is not configured',
          );
        }
        throw error;
      });
  }

  @Post('checkout-sessions/release')
  async releaseCheckoutReservation(
    @Body() dto: ReleaseCheckoutReservationDto,
    @Req() req: any,
  ) {
    return this.billingCredits.releaseCheckoutReservation({
      tenantId: req.uprm.tenantId,
      walletRedemptionId: dto.walletRedemptionId,
    });
  }
}
