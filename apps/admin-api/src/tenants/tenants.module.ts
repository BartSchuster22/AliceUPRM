import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { BootstrapTokenGuard } from '../auth/bootstrap-token.guard';

@Module({
  controllers: [TenantsController],
  providers: [BootstrapTokenGuard],
})
export class TenantsModule {}
