import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PayoutService } from '@uprm/payouts';
import { BootstrapTokenGuard } from '../auth/bootstrap-token.guard';
import { FailPayoutDto } from './dto/fail-payout.dto';

@Controller('admin/payouts')
@UseGuards(BootstrapTokenGuard)
export class PayoutsController {
  private readonly svc = new PayoutService();

  @Get(':id')
  async get(@Param('id') id: string) {
    const payout = await this.svc.getPayout(id);
    if (!payout) throw new NotFoundException('payout not found');
    return mapPayout(payout);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string) {
    return mapPayout(await this.svc.approvePayout(id));
  }

  @Post(':id/send')
  async send(@Param('id') id: string) {
    return mapPayout(await this.svc.markSent(id));
  }

  @Post(':id/fail')
  async fail(@Param('id') id: string, @Body() dto: FailPayoutDto) {
    return mapPayout(await this.svc.failPayout(id, dto.reason));
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return mapPayout(await this.svc.cancelPayout(id));
  }
}

function mapPayout(payout: any) {
  return {
    id: payout.id,
    tenant_id: payout.tenantId,
    tenant_user_id: payout.tenantUserId,
    amount_minor: Number(payout.amountMinor),
    base_currency: payout.baseCurrency,
    destination_currency: payout.destinationCurrency,
    payout_method: payout.payoutMethod,
    destination: payout.destination,
    status: payout.status,
    failure_reason: payout.failureReason ?? null,
    external_payout_id: payout.externalPayoutId ?? null,
    approved_at: payout.approvedAt ?? null,
    sent_at: payout.sentAt ?? null,
    failed_at: payout.failedAt ?? null,
    cancelled_at: payout.cancelledAt ?? null,
    created_at: payout.createdAt ?? null,
    updated_at: payout.updatedAt ?? null,
  };
}
