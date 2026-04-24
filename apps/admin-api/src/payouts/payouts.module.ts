import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PayoutsController } from './payouts.controller';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PayoutsController],
})
export class PayoutsModule {}
