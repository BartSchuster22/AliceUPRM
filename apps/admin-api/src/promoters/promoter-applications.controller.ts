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
import { prisma } from '@uprm/db';
import { PromoterService } from '@uprm/promoter';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ManualCreatePromoterDto } from './dto/manual-create-promoter.dto';
import { ReviewPromoterApplicationDto } from './dto/review-promoter-application.dto';

@Controller('admin/promoter-applications')
@UseGuards(AdminJwtGuard, RolesGuard)
export class PromoterApplicationsController {
  private readonly svc = new PromoterService();
  private readonly audit = new AuditService();

  @Get()
  @Roles('super_admin', 'tenant_admin', 'support')
  async list() {
    const items = await this.svc.listApplications();
    return Promise.all(
      items.map((application) => this.mapApplicationWithStatus(application)),
    );
  }

  @Post('manual-create')
  @Roles('super_admin', 'tenant_admin')
  async manualCreate(
    @Body() dto: ManualCreatePromoterDto,
    @Req() req: AdminRequestLike,
  ) {
    const result = await this.svc.manualActivatePromoter({
      tenantId: dto.tenantId,
      tenantUserId: dto.tenantUserId,
      adminUserId: req.admin?.adminUserId ?? 'system',
      promoterStatus: dto.promoterStatus,
      note: dto.note,
    });

    await writeAudit(
      this.audit,
      req,
      'promoter.application.manual_create',
      result.application.id,
      null,
      result.application,
    );
    return mapApplication(result.application);
  }

  @Post(':id/approve')
  @Roles('super_admin', 'tenant_admin')
  async approve(
    @Param('id') id: string,
    @Body() dto: ReviewPromoterApplicationDto,
    @Req() req: AdminRequestLike,
  ) {
    const result = await this.svc.approveApplication({
      applicationId: id,
      adminUserId: req.admin?.adminUserId ?? 'system',
      note: dto.note,
      promoterStatus: dto.promoterStatus,
    });

    await writeAudit(
      this.audit,
      req,
      'promoter.application.approve',
      id,
      null,
      result.application,
    );
    return mapApplication(result.application);
  }

  @Post(':id/reject')
  @Roles('super_admin', 'tenant_admin')
  async reject(
    @Param('id') id: string,
    @Body() dto: ReviewPromoterApplicationDto,
    @Req() req: AdminRequestLike,
  ) {
    const application = await this.svc.rejectApplication({
      applicationId: id,
      adminUserId: req.admin?.adminUserId ?? 'system',
      note: dto.note,
    });

    await writeAudit(
      this.audit,
      req,
      'promoter.application.reject',
      id,
      null,
      application,
    );
    return mapApplication(application);
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'support')
  async detail(@Param('id') id: string) {
    const application = await this.svc.getApplication(id);
    if (!application) {
      throw new NotFoundException('promoter application not found');
    }
    return this.mapApplicationWithStatus(application);
  }

  @Get(':id/performance')
  @Roles('super_admin', 'tenant_admin', 'support')
  async performance(@Param('id') id: string, @Query('days') daysRaw?: string) {
    const application = await this.svc.getApplication(id);
    if (!application) {
      throw new NotFoundException('promoter application not found');
    }

    const days = Math.min(
      Math.max(parseInt(daysRaw ?? '30', 10) || 30, 1),
      365,
    );
    const start = new Date(Date.now() - (days - 1) * 86_400_000);
    const rows = await prisma.promoterMetricsDaily.findMany({
      where: {
        tenantId: application.tenantId,
        tenantUserId: application.tenantUserId,
        date: {
          gte: new Date(
            Date.UTC(
              start.getUTCFullYear(),
              start.getUTCMonth(),
              start.getUTCDate(),
            ),
          ),
        },
      },
      orderBy: { date: 'asc' },
    } as any);

    return {
      tenant_id: application.tenantId,
      tenant_user_id: application.tenantUserId,
      days,
      metrics_daily: rows.map((row: any) => ({
        date: row.date,
        new_paid_referrals_count: row.newPaidReferralsCount,
        gross_revenue_referred: row.grossRevenueReferred.toString(),
        net_reward_generated: row.netRewardGenerated.toString(),
        refund_count: row.refundCount,
      })),
    };
  }

  private async mapApplicationWithStatus(application: any) {
    const promoterStatus = await this.svc.getPromoterStatus({
      tenantId: application.tenantId,
      tenantUserId: application.tenantUserId,
    });
    return mapApplication(application, promoterStatus);
  }
}

async function writeAudit(
  audit: AuditService,
  req: AdminRequestLike,
  action: string,
  applicationId: string,
  before: any,
  after: any,
) {
  if (!req.admin) return;
  await audit.write({
    actor: req.admin,
    request: req,
    action,
    resourceType: 'promoter_application',
    resourceId: applicationId,
    tenantId: after?.tenantId ?? before?.tenantId ?? null,
    before,
    after,
  });
}

function mapApplication(application: any, promoterStatus?: any) {
  return {
    id: application.id,
    tenant_id: application.tenantId,
    tenant_user_id: application.tenantUserId,
    status: application.status,
    promoter_status:
      promoterStatus?.promoterStatus ?? inferPromoterStatus(application.status),
    qualification_source: promoterStatus?.qualificationSource ?? null,
    manual_override: promoterStatus?.manualOverride ?? false,
    notes: application.notes ?? null,
    submitted_at: application.submittedAt ?? null,
    reviewed_by_admin_id: application.reviewedByAdminId ?? null,
    reviewed_at: application.reviewedAt ?? null,
    links: Array.isArray(application.links)
      ? application.links.map((link: any) => ({
          id: link.id,
          link_type: link.linkType,
          url: link.url,
          verification_status: link.verificationStatus,
          proof_json: link.proofJson ?? null,
        }))
      : [],
  };
}

function inferPromoterStatus(status: string) {
  if (status === 'approved') return 'promoter';
  if (status === 'submitted' || status === 'under_review')
    return 'pending_review';
  if (status === 'rejected') return 'rejected';
  return status;
}
