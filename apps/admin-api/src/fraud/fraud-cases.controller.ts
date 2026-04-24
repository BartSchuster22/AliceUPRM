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
import { FraudService } from '@uprm/fraud';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ListFraudCasesQueryDto } from './dto/list-fraud-cases-query.dto';
import { ResolveFraudCaseDto } from './dto/resolve-fraud-case.dto';

@Controller('admin/fraud-cases')
@UseGuards(AdminJwtGuard, RolesGuard)
export class FraudCasesController {
  private readonly fraud = new FraudService();
  private readonly audit = new AuditService();

  @Get()
  @Roles('super_admin', 'tenant_admin', 'fraud_reviewer', 'support')
  async list(@Query() query: ListFraudCasesQueryDto) {
    const rows = await this.fraud.listCases({
      tenantId: query.tenantId,
      status: query.status,
      severity: query.severity,
    });

    return rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenantId,
      tenant_user_id: row.tenantUserId,
      status: row.status,
      severity: row.severity,
      score_total: row.scoreTotal,
      hold_count: row.holdCount,
      resolution: row.resolution,
      resolution_note: row.resolutionNote,
      opened_by_signal_id: row.openedBySignalId,
      opened_at: row.openedAt,
      resolved_at: row.resolvedAt,
      threshold_snapshot: row.thresholdSnapshot,
    }));
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'fraud_reviewer', 'support')
  async detail(@Param('id') id: string) {
    const detail = await this.fraud.getCase(id);
    if (!detail) {
      throw new NotFoundException('fraud case not found');
    }

    return {
      id: detail.id,
      tenant_id: detail.tenantId,
      tenant_user_id: detail.tenantUserId,
      status: detail.status,
      severity: detail.severity,
      score_total: detail.scoreTotal,
      hold_count: detail.holdCount,
      resolution: detail.resolution,
      resolution_note: detail.resolutionNote,
      opened_by_signal_id: detail.openedBySignalId,
      opened_at: detail.openedAt,
      resolved_at: detail.resolvedAt,
      threshold_snapshot: detail.thresholdSnapshot,
      opened_by_signal: detail.openedBySignal,
      reward_holds: detail.rewardHolds.map((hold) => ({
        id: hold.id,
        scheduled_posting_id: hold.scheduledPostingId,
        status: hold.status,
        reason_code: hold.reasonCode,
        created_at: hold.createdAt,
        released_at: hold.releasedAt,
        rejected_at: hold.rejectedAt,
      })),
      related_signals: detail.relatedSignals.map((signal) => ({
        id: signal.id,
        signal_type: signal.signalType,
        score: signal.score,
        severity: signal.severity,
        metadata: signal.metadata,
        created_at: signal.createdAt,
      })),
      events: detail.events.map((event) => ({
        id: event.id,
        actor_type: event.actorType,
        actor_id: event.actorId,
        action: event.action,
        before_json: event.beforeJson,
        after_json: event.afterJson,
        created_at: event.createdAt,
      })),
    };
  }

  @Post(':id/allow')
  @Roles('super_admin', 'tenant_admin', 'fraud_reviewer')
  async allow(
    @Param('id') id: string,
    @Body() dto: ResolveFraudCaseDto,
    @Req() req: AdminRequestLike,
  ) {
    return this.resolveAndAudit('fraud.case.allow', 'allow', id, dto.note, req);
  }

  @Post(':id/reject')
  @Roles('super_admin', 'tenant_admin', 'fraud_reviewer')
  async reject(
    @Param('id') id: string,
    @Body() dto: ResolveFraudCaseDto,
    @Req() req: AdminRequestLike,
  ) {
    return this.resolveAndAudit(
      'fraud.case.reject',
      'reject',
      id,
      dto.note,
      req,
    );
  }

  @Post(':id/escalate')
  @Roles('super_admin', 'tenant_admin', 'fraud_reviewer')
  async escalate(
    @Param('id') id: string,
    @Body() dto: ResolveFraudCaseDto,
    @Req() req: AdminRequestLike,
  ) {
    return this.resolveAndAudit(
      'fraud.case.escalate',
      'escalate',
      id,
      dto.note,
      req,
    );
  }

  private async resolveAndAudit(
    auditAction: string,
    resolution: 'allow' | 'reject' | 'escalate',
    id: string,
    note: string | undefined,
    req: AdminRequestLike,
  ) {
    const before = await this.fraud.getCase(id);
    if (!before) {
      throw new NotFoundException('fraud case not found');
    }

    const actor = req.admin
      ? { actorType: 'admin' as const, actorId: req.admin.adminUserId }
      : { actorType: 'system' as const };

    const after =
      resolution === 'allow'
        ? await this.fraud.allowCase(id, actor, note)
        : resolution === 'reject'
          ? await this.fraud.rejectCase(id, actor, note)
          : await this.fraud.escalateCase(id, actor, note);

    if (req.admin) {
      await this.audit.write({
        actor: req.admin,
        request: req,
        action: auditAction,
        resourceType: 'fraud_case',
        resourceId: id,
        tenantId: after.tenantId,
        before,
        after,
      });
    }

    return this.detail(id);
  }
}
