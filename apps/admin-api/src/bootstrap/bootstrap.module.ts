import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BootstrapController } from './bootstrap.controller';

@Module({
  imports: [AuthModule],
  controllers: [BootstrapController],
})
export class BootstrapModule {}
