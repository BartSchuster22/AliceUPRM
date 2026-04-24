import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/fraud-cases')
@UseGuards(AdminJwtGuard, RolesGuard)
export class FraudCasesController {
  @Get()
  @Roles('super_admin', 'tenant_admin', 'fraud_reviewer', 'support')
  async list() {
    return {
      items: [],
      status: 'not_implemented_yet',
      message:
        'Fraud case workflow belongs to the next domain phase and is not implemented yet.',
    };
  }
}
