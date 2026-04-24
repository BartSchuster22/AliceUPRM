import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StripeWebhooksController } from './stripe-webhooks.controller';
import { WebhookDeliveriesController } from './webhook-deliveries.controller';

@Module({
  imports: [AuthModule],
  controllers: [StripeWebhooksController, WebhookDeliveriesController],
})
export class StripeWebhooksModule {}
