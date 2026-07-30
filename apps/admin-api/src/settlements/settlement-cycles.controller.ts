import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SettlementService } from '@uprm/settlements';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CloseSettlementCycleDto } from './dto/close-settlement-cycle.dto';
import { OpenSettlementCycleDto } from './dto/open-settlement-cycle.dto';

@Controller('admin/settlement-cycles')
@UseGuards(AdminJwtGuard, RolesGuard)
export class SettlementCyclesController {
  private readonly svc = new SettlementService();
  private readonly audit = new AuditService();

  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list(
    @Query('tenant_id') tenantId?: string,
    @Query('status') status?: string,
  ) {
    const items = await this.svc.listCycles({ tenantId, status });
    return items.map(mapCycle);
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'support')
  async detail(@Param('id') id: string) {
    const cycle = await this.svc.getCycle(id);
    if (!cycle) {
      throw new NotFoundException('settlement cycle not found');
    }
    return mapCycle(cycle);
  }

  @Post('open')
  @Roles('super_admin', 'tenant_admin')
  async open(
    @Body() dto: OpenSettlementCycleDto,
    @Req() req: AdminRequestLike,
  ) {
    const cycle = await this.svc.openCycle({
      tenantId: dto.tenantId,
      adminUserId: req.admin?.adminUserId ?? 'system',
      note: dto.note,
      ...(dto.periodStart ? { periodStart: new Date(dto.periodStart) } : {}),
      ...(dto.periodEnd ? { periodEnd: new Date(dto.periodEnd) } : {}),
    });

    await writeAudit(
      this.audit,
      req,
      'settlement.cycle.open',
      cycle.id,
      null,
      cycle,
    );
    return mapCycle(cycle);
  }

  @Post(':id/close')
  @Roles('super_admin', 'tenant_admin')
  async close(
    @Param('id') id: string,
    @Body() dto: CloseSettlementCycleDto,
    @Req() req: AdminRequestLike,
  ) {
    const before = await this.svc.getCycle(id);
    if (!before) {
      throw new NotFoundException('settlement cycle not found');
    }
    const cycle = await this.svc.closeCycle({
      id,
      adminUserId: req.admin?.adminUserId ?? 'system',
      note: dto.note,
    });

    await writeAudit(
      this.audit,
      req,
      'settlement.cycle.close',
      id,
      before,
      cycle,
    );
    return mapCycle(cycle);
  }
}

async function writeAudit(
  audit: AuditService,
  req: AdminRequestLike,
  action: string,
  cycleId: string,
  before: any,
  after: any,
) {
  if (!req.admin) return;
  await audit.write({
    actor: req.admin,
    request: req,
    action,
    resourceType: 'settlement_cycle',
    resourceId: cycleId,
    tenantId: after?.tenantId ?? before?.tenantId ?? null,
    before,
    after,
  });
}

function mapCycle(cycle: any) {
  return {
    id: cycle.id,
    tenant_id: cycle.tenantId,
    currency: cycle.currency,
    status: cycle.status,
    period_start: cycle.periodStart,
    period_end: cycle.periodEnd,
    ledger_liability_minor:
      cycle.ledgerLiabilityMinor === undefined ||
      cycle.ledgerLiabilityMinor === null
        ? null
        : cycle.ledgerLiabilityMinor.toString(),
    pending_liability_minor:
      cycle.pendingLiabilityMinor === undefined ||
      cycle.pendingLiabilityMinor === null
        ? null
        : cycle.pendingLiabilityMinor.toString(),
    total_liability_minor:
      cycle.totalLiabilityMinor === undefined ||
      cycle.totalLiabilityMinor === null
        ? null
        : cycle.totalLiabilityMinor.toString(),
    note: cycle.note ?? null,
    opened_by_admin_id: cycle.openedByAdminId ?? null,
    opened_at: cycle.openedAt ?? null,
    closed_by_admin_id: cycle.closedByAdminId ?? null,
    closed_at: cycle.closedAt ?? null,
  };
}
