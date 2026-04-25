import { Module } from '@nestjs/common';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { PromoterApplicationsController } from './promoter-applications.controller';

@Module({
  controllers: [PromoterApplicationsController],
  providers: [HmacAuthGuard],
})
export class PromoterApplicationsModule {}
