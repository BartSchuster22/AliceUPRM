import { Module } from '@nestjs/common';
import { BootstrapTokenGuard } from '../auth/bootstrap-token.guard';
import { PayoutsController } from './payouts.controller';

@Module({
  controllers: [PayoutsController],
  providers: [BootstrapTokenGuard],
})
export class PayoutsModule {}
