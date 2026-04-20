import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';

@Module({
  controllers: [ReferralsController],
  providers: [HmacAuthGuard],
})
export class ReferralsModule {}
