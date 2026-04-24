import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from '../auth/admin-auth.service';
import { BootstrapTokenGuard } from '../auth/bootstrap-token.guard';
import { UpsertAdminUserDto } from './dto/upsert-admin-user.dto';

@Controller('bootstrap/admin-users')
@UseGuards(BootstrapTokenGuard)
export class BootstrapController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post()
  async upsert(@Body() dto: UpsertAdminUserDto) {
    const adminUser = await this.auth.upsertAdminUser({
      subject: dto.subject,
      email: dto.email ?? null,
      displayName: dto.displayName ?? null,
      roles: dto.roles,
    });

    return {
      id: adminUser.id,
      subject: adminUser.subject,
      email: adminUser.email,
      display_name: adminUser.displayName,
      roles: adminUser.roles,
      status: adminUser.status,
    };
  }
}
