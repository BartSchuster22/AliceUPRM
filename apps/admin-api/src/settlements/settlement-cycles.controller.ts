import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/settlement-cycles')
@UseGuards(AdminJwtGuard, RolesGuard)
export class SettlementCyclesController {
  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list() {
    return {
      items: [],
      status: 'not_implemented_yet',
      message: 'Settlement cycle operations are reserved for a later phase.',
    };
  }
}
