import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';

@Module({
  controllers: [BillingController],
  providers: [HmacAuthGuard],
})
export class BillingModule {}
