import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SettlementCyclesController } from './settlement-cycles.controller';

@Module({
  imports: [AuthModule],
  controllers: [SettlementCyclesController],
})
export class SettlementsModule {}
