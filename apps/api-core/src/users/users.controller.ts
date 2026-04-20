import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IdentityService } from '@uprm/identity';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('v1/users')
@UseGuards(HmacAuthGuard)
export class UsersController {
  private readonly svc = new IdentityService();

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
}
