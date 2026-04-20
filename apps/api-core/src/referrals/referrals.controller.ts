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
import { ReferralService, ReferralError } from '@uprm/referrals';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateCodeDto } from './dto/create-code.dto';
import { ApplyCodeDto } from './dto/apply-code.dto';

@Controller('v1/referrals')
@UseGuards(HmacAuthGuard)
export class ReferralsController {
  private readonly svc = new ReferralService();

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
}
