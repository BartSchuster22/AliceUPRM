import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';

@Module({
  controllers: [EventsController],
  providers: [HmacAuthGuard],
})
export class EventsModule {}
