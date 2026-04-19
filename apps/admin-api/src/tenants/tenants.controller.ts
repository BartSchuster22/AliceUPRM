import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from '@uprm/tenants';
import { BootstrapTokenGuard } from '../auth/bootstrap-token.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Controller('admin/tenants')
@UseGuards(BootstrapTokenGuard)
export class TenantsController {
  private readonly svc = new TenantService();

  @Post()
  async create(@Body() dto: CreateTenantDto) {
    const tenant = await this.svc.createTenant({
      name: dto.name,
      slug: dto.slug,
      baseCurrency: dto.baseCurrency,
    });
    const apiKey = await this.svc.issueApiKey(tenant.id, [
      'events.write',
      'users.write',
    ]);
    return {
      tenant,
      api_key: {
        id: apiKey.id,
        key_prefix: apiKey.keyPrefix,
        plaintext_key: apiKey.plaintextKey,
        note: 'This plaintext key is shown ONCE. Store it immediately.',
      },
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const t = await this.svc.getTenant(id);
    if (!t) throw new NotFoundException('tenant not found');
    return t;
  }
}
