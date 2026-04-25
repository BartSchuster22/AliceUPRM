import { Module } from '@nestjs/common';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { ProductsController } from './products.controller';

@Module({
  controllers: [ProductsController],
  providers: [HmacAuthGuard],
})
export class ProductsModule {}
