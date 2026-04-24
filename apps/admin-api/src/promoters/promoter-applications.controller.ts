import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/promoter-applications')
@UseGuards(AdminJwtGuard, RolesGuard)
export class PromoterApplicationsController {
  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list() {
    return {
      items: [],
      status: 'not_implemented_yet',
      message:
        'Promoter applications domain has not been implemented in UPRM yet.',
    };
  }
}
