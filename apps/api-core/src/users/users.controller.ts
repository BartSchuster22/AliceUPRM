import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PayoutService } from '@uprm/payouts';
import { TenantService } from '@uprm/tenants';
import { IdentityService } from '@uprm/identity';
import { ReferralService } from '@uprm/referrals';
import { BalanceService } from '@uprm/ledger';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { RequestPayoutDto } from './dto/request-payout.dto';

@Controller('v1/users')
@UseGuards(HmacAuthGuard)
export class UsersController {
  private readonly svc = new IdentityService();
  private readonly refSvc = new ReferralService();
  private readonly tenantSvc = new TenantService();
  private readonly balanceSvc = new BalanceService();
  private readonly payoutSvc = new PayoutService();

  @Post()
  async create(@Body() dto: CreateUserDto, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const tu = await this.svc.findOrCreateTenantUser({
      tenantId,
      email: dto.email,
      externalUserId: dto.externalUserId,
      username: dto.username,
    });
    return { tenant_user: tu };
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const tu = await this.svc.getTenantUser(tenantId, id);
    if (!tu) throw new NotFoundException('tenant user not found');
    return tu;
  }

  @Get(':id/balance')
  async balance(@Param('id') id: string, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const tu = await this.svc.getTenantUser(tenantId, id);
    if (!tu) throw new NotFoundException('tenant user not found');

    const tenant = await this.tenantSvc.getTenant(tenantId);
    if (!tenant) throw new NotFoundException('tenant not found');

    const currency = tenant.baseCurrency;
    const accountBalance = await this.balanceSvc.getUserBalance(
      tenantId,
      id,
      currency,
    );
    const rawBalance = accountBalance?.balance ?? 0n;
    const amountMinor = Number(-rawBalance);

    return {
      tenant_user_id: id,
      base_currency: currency,
      balance_credits: amountMinor,
      balance_display: `${amountMinor} Credits`,
      balance_as_money: {
        amount_minor: amountMinor,
        formatted: formatMinorCurrency(amountMinor, currency),
      },
    };
  }

  @Post(':id/payouts')
  async requestPayout(
    @Param('id') id: string,
    @Body() dto: RequestPayoutDto,
    @Req() req: any,
  ) {
    const tenantId: string = req.uprm.tenantId;
    const payout = await this.payoutSvc.requestPayout({
      tenantId,
      tenantUserId: id,
      amountMinor: BigInt(dto.amountMinor),
      payoutMethod: dto.payoutMethod,
      destination: dto.destination,
      destinationCurrency: dto.destinationCurrency,
    });
    return mapPayout(payout);
  }

  @Get(':id/payouts')
  async listPayouts(@Param('id') id: string, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const payouts = await this.payoutSvc.listUserPayouts(tenantId, id);
    return { payouts: payouts.map(mapPayout) };
  }

  @Get(':id/referral-tree')
  async tree(
    @Param('id') id: string,
    @Query('depth') depthRaw: string,
    @Req() req: any,
  ) {
    const tenantId: string = req.uprm.tenantId;
    const maxDepth = Math.min(
      Math.max(parseInt(depthRaw ?? '2', 10) || 2, 1),
      10,
    );
    const nodes = await this.refSvc.getReferralTree(tenantId, id, maxDepth);
    return {
      rootTenantUserId: id,
      maxDepth,
      nodes,
    };
  }
}

function formatMinorCurrency(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function mapPayout(payout: any) {
  return {
    id: payout.id,
    tenant_id: payout.tenantId,
    tenant_user_id: payout.tenantUserId,
    amount_minor: Number(payout.amountMinor),
    base_currency: payout.baseCurrency,
    destination_currency: payout.destinationCurrency,
    payout_method: payout.payoutMethod,
    destination: payout.destination,
    status: payout.status,
    failure_reason: payout.failureReason ?? null,
    external_payout_id: payout.externalPayoutId ?? null,
    approved_at: payout.approvedAt ?? null,
    sent_at: payout.sentAt ?? null,
    failed_at: payout.failedAt ?? null,
    cancelled_at: payout.cancelledAt ?? null,
    created_at: payout.createdAt ?? null,
    updated_at: payout.updatedAt ?? null,
  };
}
