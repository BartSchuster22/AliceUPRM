import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './users.controller';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AdminUsersController],
})
export class UsersModule {}
