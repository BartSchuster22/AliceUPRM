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
import { AuditService } from '../audit/audit.service';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import type { AdminRequestLike } from '../auth/admin-auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateManualAdjustmentDto } from './dto/create-manual-adjustment.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ReferralTreeQueryDto } from './dto/referral-tree-query.dto';
import { UserDetailQueryDto } from './dto/user-detail-query.dto';

@Controller('admin/users')
@UseGuards(AdminJwtGuard, RolesGuard)
export class AdminUsersController {
  private readonly svc = new AdminUsersService();
  private readonly audit = new AuditService();

  @Get()
  @Roles('super_admin', 'tenant_admin', 'support', 'fraud_reviewer')
  async list(@Query() query: ListUsersQueryDto) {
    const rows = await this.svc.listUsers(query);
    return rows.map(mapTenantUserSummary);
  }

  @Get(':tenantUserId')
  @Roles('super_admin', 'tenant_admin', 'support', 'fraud_reviewer')
  async detail(
    @Param('tenantUserId') tenantUserId: string,
    @Query() query: UserDetailQueryDto,
  ) {
    const detail = await this.svc.getUserDetail(query.tenantId, tenantUserId);
    if (!detail) throw new NotFoundException('tenant user not found');
    return mapUserDetail(detail);
  }

  @Get(':tenantUserId/ledger')
  @Roles('super_admin', 'tenant_admin', 'support', 'fraud_reviewer')
  async ledger(
    @Param('tenantUserId') tenantUserId: string,
    @Query() query: UserDetailQueryDto,
  ) {
    return (
      await this.svc.getLedgerStatement(query.tenantId, tenantUserId)
    ).map(mapLedgerRow);
  }

  @Get(':tenantUserId/referral-tree')
  @Roles('super_admin', 'tenant_admin', 'support', 'fraud_reviewer')
  async referralTree(
    @Param('tenantUserId') tenantUserId: string,
    @Query() query: ReferralTreeQueryDto,
  ) {
    return this.svc.getReferralTree(
      query.tenantId,
      tenantUserId,
      query.depth ?? 3,
    );
  }

  @Post(':tenantUserId/manual-adjustments')
  @Roles('super_admin', 'tenant_admin')
  async manualAdjustment(
    @Param('tenantUserId') tenantUserId: string,
    @Body() dto: CreateManualAdjustmentDto,
    @Req() req: AdminRequestLike,
  ) {
    const result = await this.svc.createManualAdjustment({
      tenantId: dto.tenantId,
      tenantUserId,
      amountMinor: BigInt(dto.amountMinor),
      currency: dto.currency,
      reasonCode: dto.reasonCode,
      note: dto.note,
    });

    if (req.admin) {
      await this.audit.write({
        actor: req.admin,
        request: req,
        action: 'user.manual_adjustment.create',
        resourceType: 'tenant_user',
        resourceId: tenantUserId,
        tenantId: dto.tenantId,
        after: result,
      });
    }

    return mapManualAdjustment(result);
  }
}

function mapTenantUserSummary(row: any) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    user_id: row.userId,
    external_user_id: row.externalUserId,
    username: row.username,
    tenant_status: row.tenantStatus,
    entity_type: row.entityType ?? 'person',
    source_tenant_id: row.sourceTenantId ?? null,
    source_tenant_user_id: row.sourceTenantUserId ?? null,
    joined_at: row.joinedAt,
    metadata: row.metadata,
    email: row.user?.emailNormalized ?? null,
    email_verified: row.user?.emailVerified ?? false,
  };
}

function mapUserDetail(detail: any) {
  return {
    tenant_user: mapTenantUserSummary(detail.tenantUser),
    source_tenant: detail.sourceTenant
      ? {
          id: detail.sourceTenant.id,
          name: detail.sourceTenant.name,
          slug: detail.sourceTenant.slug,
          status: detail.sourceTenant.status,
        }
      : null,
    source_user: detail.sourceTenantUser
      ? {
          id: detail.sourceTenantUser.id,
          tenant_id: detail.sourceTenantUser.tenantId,
          user_id: detail.sourceTenantUser.userId,
          external_user_id: detail.sourceTenantUser.externalUserId,
          username: detail.sourceTenantUser.username,
          entity_type: detail.sourceTenantUser.entityType ?? 'person',
          email: detail.sourceTenantUser.user?.emailNormalized ?? null,
        }
      : null,
    balance: detail.balance
      ? {
          account_id: detail.balance.accountId,
          account_type: detail.balance.accountType,
          currency: detail.balance.currency,
          raw_balance_minor: detail.balance.balance.toString(),
          display_balance_minor: (-detail.balance.balance).toString(),
        }
      : null,
    payouts: detail.payouts.map((payout: any) => ({
      id: payout.id,
      amount_minor: payout.amountMinor.toString(),
      base_currency: payout.baseCurrency,
      status: payout.status,
      payout_method: payout.payoutMethod,
      created_at: payout.createdAt,
      approved_at: payout.approvedAt,
      sent_at: payout.sentAt,
      failed_at: payout.failedAt,
      cancelled_at: payout.cancelledAt,
    })),
  };
}

function mapLedgerRow(row: any) {
  return {
    posting_id: row.postingId,
    created_at: row.createdAt,
    amount_minor: row.amount.toString(),
    currency: row.currency,
    account_id: row.accountId,
    account_type: row.accountType,
    entry_id: row.entryId,
    description: row.description,
    idempotency_key: row.idempotencyKey,
    source_event_id: row.sourceEventId,
  };
}

function mapManualAdjustment(result: any) {
  return {
    entry_id: result.entryId,
    duplicate: result.duplicate,
    tenant_id: result.tenantId,
    tenant_user_id: result.tenantUserId,
    amount_minor: result.amountMinor.toString(),
    currency: result.currency,
    reason_code: result.reasonCode,
    note: result.note,
  };
}
