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
import { TenantService } from '@uprm/tenants';
import { IdentityService } from '@uprm/identity';
import { ReferralService } from '@uprm/referrals';
import { BalanceService } from '@uprm/ledger';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('v1/users')
@UseGuards(HmacAuthGuard)
export class UsersController {
  private readonly svc = new IdentityService();
  private readonly refSvc = new ReferralService();
  private readonly tenantSvc = new TenantService();
  private readonly balanceSvc = new BalanceService();

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
