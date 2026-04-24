import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [TenantsController],
})
export class TenantsModule {}
