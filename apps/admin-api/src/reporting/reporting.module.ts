import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportingController } from './reporting.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReportingController],
})
export class ReportingModule {}
