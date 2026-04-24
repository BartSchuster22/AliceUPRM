import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PromoterApplicationsController } from './promoter-applications.controller';

@Module({
  imports: [AuthModule],
  controllers: [PromoterApplicationsController],
})
export class PromotersModule {}
