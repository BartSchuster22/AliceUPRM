import { ReportingController } from './reporting.controller';

describe('ReportingController', () => {
  let controller: ReportingController;

  beforeEach(() => {
    controller = new ReportingController();
  });

  it('returns normalized overview payload', async () => {
    (controller as any).reporting = {
      getDashboardSeries: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        rangeDays: 30,
        conversionDaily: [
          {
            day: '2026-04-24T00:00:00.000Z',
            eventType: 'invoice_paid',
            eventCount: 2,
            distinctExternalUsers: 2,
            distinctTenantUsers: 2,
          },
        ],
        rewardPerformanceDaily: [
          {
            day: '2026-04-24T00:00:00.000Z',
            currency: 'EUR',
            rewardEntryCount: 2,
            rewardExpenseMinor: '300',
            distinctBeneficiaryUsers: 2,
            postedScheduledCount: 2,
          },
        ],
        tenantLiabilityDaily: [
          {
            day: '2026-04-24T00:00:00.000Z',
            currency: 'EUR',
            rawLiabilityMinor: '-399',
            displayLiabilityMinor: '399',
            accountCount: 2,
          },
        ],
        cohortRetentionDaily: [
          {
            cohortDay: '2026-04-20T00:00:00.000Z',
            activityDay: '2026-04-24T00:00:00.000Z',
            cohortSize: 2,
            retainedUsers: 1,
          },
        ],
      }),
    };

    const result = await controller.overview({
      tenantId: 'tenant-1',
      days: 30,
    });

    expect(
      (controller as any).reporting.getDashboardSeries,
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      days: 30,
    });
    expect(result).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        range_days: 30,
      }),
    );
    expect(result.conversion_daily[0].event_type).toBe('invoice_paid');
    expect(result.reward_performance_daily[0].reward_expense_minor).toBe('300');
    expect(result.tenant_liability_daily[0].display_liability_minor).toBe(
      '399',
    );
    expect(result.cohort_retention_daily[0].retained_users).toBe(1);
  });
});
