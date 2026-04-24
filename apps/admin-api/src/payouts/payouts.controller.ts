import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PayoutService } from '@uprm/payouts';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FailPayoutDto } from './dto/fail-payout.dto';

@Controller('admin/payouts')
@UseGuards(AdminJwtGuard, RolesGuard)
export class PayoutsController {
  private readonly svc = new PayoutService();
  private readonly audit = new AuditService();

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'support')
  async get(@Param('id') id: string) {
    const payout = await this.svc.getPayout(id);
    if (!payout) throw new NotFoundException('payout not found');
    return mapPayout(payout);
  }

  @Post(':id/approve')
  @Roles('super_admin', 'tenant_admin')
  async approve(@Param('id') id: string, @Req() req: AdminRequestLike) {
    const before = await this.svc.getPayout(id);
    const payout = await this.svc.approvePayout(id);
    const result = mapPayout(payout);
    await writeAudit(this.audit, req, 'payout.approve', id, before, result);
    return result;
  }

  @Post(':id/send')
  @Roles('super_admin', 'tenant_admin')
  async send(@Param('id') id: string, @Req() req: AdminRequestLike) {
    const before = await this.svc.getPayout(id);
    const payout = await this.svc.markSent(id);
    const result = mapPayout(payout);
    await writeAudit(this.audit, req, 'payout.send', id, before, result);
    return result;
  }

  @Post(':id/fail')
  @Roles('super_admin', 'tenant_admin')
  async fail(
    @Param('id') id: string,
    @Body() dto: FailPayoutDto,
    @Req() req: AdminRequestLike,
  ) {
    const before = await this.svc.getPayout(id);
    const payout = await this.svc.failPayout(id, dto.reason);
    const result = mapPayout(payout);
    await writeAudit(this.audit, req, 'payout.fail', id, before, result);
    return result;
  }

  @Post(':id/cancel')
  @Roles('super_admin', 'tenant_admin')
  async cancel(@Param('id') id: string, @Req() req: AdminRequestLike) {
    const before = await this.svc.getPayout(id);
    const payout = await this.svc.cancelPayout(id);
    const result = mapPayout(payout);
    await writeAudit(this.audit, req, 'payout.cancel', id, before, result);
    return result;
  }
}

async function writeAudit(
  audit: AuditService,
  req: AdminRequestLike,
  action: string,
  payoutId: string,
  before: any,
  after: any,
) {
  if (!req.admin) return;
  await audit.write({
    actor: req.admin,
    request: req,
    action,
    resourceType: 'payout',
    resourceId: payoutId,
    tenantId: before?.tenantId ?? after?.tenant_id ?? null,
    before,
    after,
  });
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
