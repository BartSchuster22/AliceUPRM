import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';

@Module({
  controllers: [UsersController],
  providers: [HmacAuthGuard],
})
export class UsersModule {}
