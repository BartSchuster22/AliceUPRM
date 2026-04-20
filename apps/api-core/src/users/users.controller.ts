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
import { IdentityService } from '@uprm/identity';
import { ReferralService } from '@uprm/referrals';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('v1/users')
@UseGuards(HmacAuthGuard)
export class UsersController {
  private readonly svc = new IdentityService();
  private readonly refSvc = new ReferralService();

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
