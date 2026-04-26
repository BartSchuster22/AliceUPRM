import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { BalanceService } from '@uprm/ledger';
import { prisma } from '@uprm/db';
import { ReferralService, ReferralError } from '@uprm/referrals';
import { FIXED_REWARD_CURRENCY } from '@uprm/rewards';
import { IdentityService } from '@uprm/identity';
import { TenantService } from '@uprm/tenants';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateCodeDto } from './dto/create-code.dto';
import { ApplyCodeDto } from './dto/apply-code.dto';

@Controller('v1/referrals')
@UseGuards(HmacAuthGuard)
export class ReferralsController {
  private readonly svc = new ReferralService();
  private readonly identitySvc = new IdentityService();
  private readonly tenantSvc = new TenantService();
  private readonly balanceSvc = new BalanceService();

  @Post('codes')
  async createCode(@Body() dto: CreateCodeDto, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const code = await this.svc.createCode({
      tenantId,
      tenantUserId: dto.tenantUserId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
    return code;
  }

  @Get('codes/:code')
  async resolve(@Param('code') code: string, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const row = await this.svc.resolveCode(tenantId, code);
    if (!row) throw new NotFoundException('code not found');
    return row;
  }

  @Post('apply')
  @HttpCode(HttpStatus.OK)
  async apply(@Body() dto: ApplyCodeDto, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    try {
      const edge = await this.svc.applyCode({
        tenantId,
        referredTenantUserId: dto.referredTenantUserId,
        code: dto.code,
      });
      return { edge };
    } catch (e) {
      if (e instanceof ReferralError) {
        throw new UnprocessableEntityException({
          code: e.code,
          message: e.message,
        });
      }
      throw e;
    }
  }

  @Get('users/:externalUserId/summary')
  async summary(
    @Param('externalUserId') externalUserId: string,
    @Req() req: any,
  ) {
    const tenantId: string = req.uprm.tenantId;
    const tenantUser = await this.identitySvc.getTenantUserByExternalUserId(
      tenantId,
      externalUserId,
    );
    if (!tenantUser) throw new NotFoundException('tenant user not found');

    const tenant = await this.tenantSvc.getTenant(tenantId);
    if (!tenant) throw new NotFoundException('tenant not found');

    let code = await prisma.referralCode.findFirst({
      where: {
        tenantId,
        tenantUserId: tenantUser.id,
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!code) {
      code = await this.svc.createCode({
        tenantId,
        tenantUserId: tenantUser.id,
      });
    }

    const ensuredCode = code;
    if (!ensuredCode) {
      throw new NotFoundException('referral code not available');
    }

    const edges = await prisma.referralEdge.findMany({
      where: {
        tenantId,
        referrerTenantUserId: tenantUser.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    const referredUsers = edges.length
      ? await prisma.tenantUser.findMany({
          where: {
            id: { in: edges.map((edge) => edge.referredTenantUserId) },
            tenantId,
          },
          select: {
            id: true,
            externalUserId: true,
          },
        })
      : [];

    const referredUserById = new Map(referredUsers.map((row) => [row.id, row]));
    const activeCount = edges.filter((edge) => !edge.lockedAt).length;
    const convertedCount = edges.filter((edge) =>
      Boolean(edge.lockedAt),
    ).length;

    const accountBalance = await this.balanceSvc.getUserBalance(
      tenantId,
      tenantUser.id,
      FIXED_REWARD_CURRENCY,
    );
    const rawBalance = accountBalance?.balance ?? 0n;
    const totalCreditCents = Number(-rawBalance);

    return {
      tenant_user_id: tenantUser.id,
      external_user_id: tenantUser.externalUserId,
      referral_code: ensuredCode.code,
      active_count: activeCount,
      converted_count: convertedCount,
      total_credit_cents: totalCreditCents,
      referrals: edges.map((edge) => ({
        id: edge.id,
        referred_tenant_user_id: edge.referredTenantUserId,
        referred_external_user_id:
          referredUserById.get(edge.referredTenantUserId)?.externalUserId ??
          null,
        referral_code: ensuredCode.code,
        locked: Boolean(edge.lockedAt),
        created_at: edge.createdAt,
        locked_at: edge.lockedAt,
      })),
      ledger: [],
    };
  }
}
