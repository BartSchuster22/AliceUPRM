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
import { PromoterService } from '@uprm/promoter';
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
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
    return items.map(mapApplication);
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
    });

    await writeAudit(this.audit, req, 'promoter.application.approve', id, null, result.application);
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

    await writeAudit(this.audit, req, 'promoter.application.reject', id, null, application);
    return mapApplication(application);
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'support')
  async detail(@Param('id') id: string) {
    const application = await this.svc.getApplication(id);
    if (!application) {
      throw new NotFoundException('promoter application not found');
    }
    return mapApplication(application);
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

function mapApplication(application: any) {
  return {
    id: application.id,
    tenant_id: application.tenantId,
    tenant_user_id: application.tenantUserId,
    status: application.status,
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
