import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { PromoterService } from '@uprm/promoter';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';
import { CreatePromoterApplicationDto } from './dto/create-promoter-application.dto';

@Controller('v1/promoter-applications')
@UseGuards(HmacAuthGuard)
export class PromoterApplicationsController {
  private readonly svc = new PromoterService();

  @Post()
  async create(@Body() dto: CreatePromoterApplicationDto, @Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    const application = await this.svc.submitApplication({
      tenantId,
      tenantUserId: dto.tenantUserId,
      ...(dto.notes ? { notes: dto.notes } : {}),
      ...(dto.links ? { links: dto.links } : {}),
    });

    return {
      application: mapApplication(application),
    };
  }
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
  };
}
