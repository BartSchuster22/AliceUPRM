import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportingService } from '@uprm/reporting';
import { AdminJwtGuard } from '../auth/admin-jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ReportingQueryDto } from './dto/reporting-query.dto';

@Controller('admin/reports')
@UseGuards(AdminJwtGuard, RolesGuard)
export class ReportingController {
  private readonly reporting = new ReportingService();

  @Get('overview')
  @Roles('super_admin', 'tenant_admin', 'support', 'fraud_reviewer')
  async overview(@Query() query: ReportingQueryDto) {
    const result = await this.reporting.getDashboardSeries({
      tenantId: query.tenantId,
      days: query.days,
    });

    return {
      tenant_id: result.tenantId,
      range_days: result.rangeDays,
      conversion_daily: result.conversionDaily.map((row: any) => ({
        day: row.day,
        event_type: row.eventType,
        event_count: row.eventCount,
        distinct_external_users: row.distinctExternalUsers,
        distinct_tenant_users: row.distinctTenantUsers,
      })),
      reward_performance_daily: result.rewardPerformanceDaily.map(
        (row: any) => ({
          day: row.day,
          currency: row.currency,
          reward_entry_count: row.rewardEntryCount,
          reward_expense_minor: row.rewardExpenseMinor,
          distinct_beneficiary_users: row.distinctBeneficiaryUsers,
          posted_scheduled_count: row.postedScheduledCount,
        }),
      ),
      tenant_liability_daily: result.tenantLiabilityDaily.map((row: any) => ({
        day: row.day,
        currency: row.currency,
        raw_liability_minor: row.rawLiabilityMinor,
        display_liability_minor: row.displayLiabilityMinor,
        account_count: row.accountCount,
      })),
      cohort_retention_daily: result.cohortRetentionDaily.map((row: any) => ({
        cohort_day: row.cohortDay,
        activity_day: row.activityDay,
        cohort_size: row.cohortSize,
        retained_users: row.retainedUsers,
      })),
    };
  }
}
