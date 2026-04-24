import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FraudCasesController } from './fraud-cases.controller';

@Module({
  imports: [AuthModule],
  controllers: [FraudCasesController],
})
export class FraudModule {}
