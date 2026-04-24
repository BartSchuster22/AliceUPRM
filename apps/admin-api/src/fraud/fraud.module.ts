import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { FraudCasesController } from './fraud-cases.controller';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [FraudCasesController],
})
export class FraudModule {}
