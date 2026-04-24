import { Module } from '@nestjs/common';
import { StripeWebhooksController } from './stripe-webhooks.controller';

@Module({
  controllers: [StripeWebhooksController],
})
export class StripeWebhooksModule {}
