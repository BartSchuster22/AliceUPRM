import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { TenantService } from '@uprm/tenants';
import { RegisterProductDto } from './dto/register-product.dto';

@Controller('v1/products')
@UseGuards(HmacAuthGuard)
export class ProductsController {
  private readonly tenantSvc = new TenantService();

  @Post('register')
  async register(@Body() dto: RegisterProductDto, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const product = await this.tenantSvc.registerCheckoutProduct(tenantId, {
      ref: dto.ref,
      name: dto.name,
      ...(dto.plan ? { plan: dto.plan } : {}),
      ...(dto.productDescription
        ? { productDescription: dto.productDescription }
        : {}),
      ...(dto.priceDescription
        ? { priceDescription: dto.priceDescription }
        : {}),
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      billingInterval: dto.billingInterval,
      active: dto.active ?? true,
    });

    return {
      product,
    };
  }
}
