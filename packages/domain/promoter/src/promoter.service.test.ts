import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromoterError, PromoterService } from './promoter.service';

function isoDate(value: string) {
  return new Date(value);
}

describe('PromoterService', () => {
  let db: any;
  let svc: PromoterService;

  beforeEach(() => {
    db = {
      tenantUser: {
        findFirst: vi.fn(),
      },
      promoterApplication: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      promoterApplicationLink: {
        createMany: vi.fn(),
      },
      promoterProfile: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      promoterMetricsDaily: {
        upsert: vi.fn(),
      },
      tenantConfig: {
        findMany: vi.fn(),
      },
      referralEdge: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) => fn(db)),
    };
    svc = new PromoterService(db);
  });

  it('submits a promoter application with links for a tenant user', async () => {
    db.tenantUser.findFirst.mockResolvedValue({ id: 'tu-1', tenantId: 'tenant-1' });
    db.promoterApplication.findFirst.mockResolvedValue(null);
    db.promoterApplication.create.mockResolvedValue({
      id: 'app-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      status: 'submitted',
      notes: 'review me',
      submittedAt: new Date('2026-04-25T00:00:00.000Z'),
      reviewedByAdminId: null,
      reviewedAt: null,
    });

    const result = await svc.submitApplication({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      notes: 'review me',
      links: [
        {
          linkType: 'portfolio',
          url: 'https://example.com/portfolio',
          proofJson: { followers: 1200 },
        },
      ],
    });

    expect(db.promoterApplication.create).toHaveBeenCalled();
    expect(db.promoterApplicationLink.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          applicationId: 'app-1',
          linkType: 'portfolio',
          url: 'https://example.com/portfolio',
          verificationStatus: 'unverified',
        }),
      ],
    });
    expect(result.status).toBe('submitted');
  });

  it('rejects duplicate pending applications for the same tenant user', async () => {
    db.tenantUser.findFirst.mockResolvedValue({ id: 'tu-1', tenantId: 'tenant-1' });
    db.promoterApplication.findFirst.mockResolvedValue({ id: 'app-existing', status: 'submitted' });

    await expect(
      svc.submitApplication({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
      }),
    ).rejects.toMatchObject({ code: 'APPLICATION_ALREADY_OPEN' });
  });

  it('approves an application and writes a manual override promoter profile', async () => {
    db.promoterApplication.findUnique.mockResolvedValue({
      id: 'app-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      status: 'submitted',
      links: [],
    });
    db.promoterProfile.findFirst.mockResolvedValue({ id: 'profile-old', effectiveTo: null });
    db.promoterApplication.update.mockResolvedValue({ id: 'app-1', status: 'approved' });
    db.promoterProfile.create.mockResolvedValue({
      id: 'profile-new',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      promoterStatus: 'affiliate',
      qualificationSource: 'manual',
      manualOverride: true,
      effectiveFrom: new Date('2026-04-25T00:00:00.000Z'),
      effectiveTo: null,
    });

    const result = await svc.approveApplication({
      applicationId: 'app-1',
      adminUserId: 'admin-1',
      note: 'looks good',
      promoterStatus: 'affiliate',
    });

    expect(db.promoterProfile.updateMany).toHaveBeenCalled();
    expect(db.promoterProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        promoterStatus: 'affiliate',
        qualificationSource: 'manual',
        manualOverride: true,
      }),
    });
    expect(result.application.status).toBe('approved');
    expect(result.profile.promoterStatus).toBe('affiliate');
  });

  it('manually activates a promoter with a chosen promoter type', async () => {
    db.tenantUser.findFirst.mockResolvedValue({
      id: 'tu-9',
      tenantId: 'tenant-1',
      externalUserId: 'alice',
    });
    db.promoterProfile.findFirst.mockResolvedValue(null);
    db.promoterApplication.create.mockResolvedValue({
      id: 'app-manual-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-9',
      status: 'approved',
      notes: 'manual activation',
      submittedAt: new Date('2026-04-25T00:00:00.000Z'),
      reviewedAt: new Date('2026-04-25T00:00:00.000Z'),
      reviewedByAdminId: 'admin-1',
    });
    db.promoterProfile.create.mockResolvedValue({
      id: 'profile-manual-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-9',
      promoterStatus: 'creator',
      qualificationSource: 'manual',
      manualOverride: true,
      effectiveFrom: new Date('2026-04-25T00:00:00.000Z'),
      effectiveTo: null,
    });

    const result = await (svc as any).manualActivatePromoter({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-9',
      adminUserId: 'admin-1',
      promoterStatus: 'creator',
      note: 'manual activation',
    });

    expect(db.promoterApplication.create).toHaveBeenCalled();
    expect(db.promoterProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-9',
        promoterStatus: 'creator',
        qualificationSource: 'manual',
        manualOverride: true,
      }),
    });
    expect(result.profile.promoterStatus).toBe('creator');
  });

  it('rejects an application without creating a promoter profile', async () => {
    db.promoterApplication.findUnique.mockResolvedValue({
      id: 'app-2',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-2',
      status: 'submitted',
      links: [],
    });
    db.promoterApplication.update.mockResolvedValue({
      id: 'app-2',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-2',
      status: 'rejected',
      reviewedByAdminId: 'admin-1',
      reviewedAt: new Date('2026-04-25T00:00:00.000Z'),
      notes: 'not enough proof',
    });

    const result = await svc.rejectApplication({
      applicationId: 'app-2',
      adminUserId: 'admin-1',
      note: 'not enough proof',
    });

    expect(db.promoterProfile.create).not.toHaveBeenCalled();
    expect(result.status).toBe('rejected');
  });

  it('rolls up promoter metrics from locked referral edges for a date', async () => {
    db.referralEdge.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        referrerTenantUserId: 'ref-1',
        lockedAt: isoDate('2026-04-25T10:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        referrerTenantUserId: 'ref-1',
        lockedAt: isoDate('2026-04-25T11:00:00.000Z'),
      },
      {
        tenantId: 'tenant-1',
        referrerTenantUserId: 'ref-2',
        lockedAt: isoDate('2026-04-25T12:00:00.000Z'),
      },
    ]);

    const result = await svc.rollupDailyMetrics({
      tenantId: 'tenant-1',
      date: isoDate('2026-04-25T00:00:00.000Z'),
    });

    expect(db.promoterMetricsDaily.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ rows: 2 });
  });

  it('auto-promotes users who meet the configured paid-referral threshold', async () => {
    db.tenantConfig.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        promoterConfig: {
          autoPromoterRule: {
            requiredPaidReferrals: 2,
            windowDays: 30,
          },
          retentionRules: [],
        },
      },
    ]);
    db.promoterMetricsDaily.findMany = vi.fn().mockResolvedValue([
      {
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        date: isoDate('2026-04-25T00:00:00.000Z'),
        newPaidReferralsCount: 2,
      },
    ]);
    db.promoterProfile.findMany.mockResolvedValue([]);
    db.promoterProfile.create.mockResolvedValue({
      id: 'profile-auto-1',
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
      promoterStatus: 'promoter',
      qualificationSource: 'auto',
      manualOverride: false,
      effectiveFrom: isoDate('2026-04-25T00:00:00.000Z'),
      effectiveTo: null,
    });

    const result = await svc.evaluateAutoQualifications({
      asOf: isoDate('2026-04-25T00:00:00.000Z'),
    });

    expect(db.promoterProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        tenantUserId: 'tu-1',
        promoterStatus: 'promoter',
        qualificationSource: 'auto',
        manualOverride: false,
      }),
    });
    expect(result.transitions).toBe(1);
  });

  it('does not override a manual promoter profile during auto evaluation', async () => {
    db.tenantConfig.findMany.mockResolvedValue([
      {
        tenantId: 'tenant-1',
        promoterConfig: {
          autoPromoterRule: {
            requiredPaidReferrals: 1,
            windowDays: 30,
          },
          retentionRules: [],
        },
      },
    ]);
    db.promoterMetricsDaily.findMany = vi.fn().mockResolvedValue([
      {
        tenantId: 'tenant-1',
        tenantUserId: 'tu-2',
        date: isoDate('2026-04-25T00:00:00.000Z'),
        newPaidReferralsCount: 3,
      },
    ]);
    db.promoterProfile.findMany.mockResolvedValue([
      {
        id: 'profile-manual',
        tenantId: 'tenant-1',
        tenantUserId: 'tu-2',
        promoterStatus: 'promoter',
        qualificationSource: 'manual',
        manualOverride: true,
        effectiveFrom: isoDate('2026-04-01T00:00:00.000Z'),
        effectiveTo: null,
      },
    ]);

    const result = await svc.evaluateAutoQualifications({
      asOf: isoDate('2026-04-25T00:00:00.000Z'),
    });

    expect(db.promoterProfile.create).not.toHaveBeenCalled();
    expect(result.transitions).toBe(0);
  });

  it('returns pending_review when a submitted application exists', async () => {
    db.promoterProfile.findFirst.mockResolvedValue(null);
    db.promoterApplication.findFirst.mockResolvedValue({
      id: 'app-3',
      status: 'submitted',
      submittedAt: new Date('2026-04-25T00:00:00.000Z'),
    });

    const result = await svc.getPromoterStatus({ tenantId: 'tenant-1', tenantUserId: 'tu-3' });

    expect(result.promoterStatus).toBe('pending_review');
    expect(result.source).toBe('application');
  });

  it('defaults to user status when no profile or application exists', async () => {
    db.promoterProfile.findFirst.mockResolvedValue(null);
    db.promoterApplication.findFirst.mockResolvedValue(null);

    const result = await svc.getPromoterStatus({ tenantId: 'tenant-1', tenantUserId: 'tu-4' });

    expect(result.promoterStatus).toBe('user');
    expect(result.manualOverride).toBe(false);
  });

  it('rejects approving a non-submitted application', async () => {
    db.promoterApplication.findUnique.mockResolvedValue({
      id: 'app-4',
      status: 'approved',
      links: [],
    });

    await expect(
      svc.approveApplication({ applicationId: 'app-4', adminUserId: 'admin-1' }),
    ).rejects.toBeInstanceOf(PromoterError);
  });
});
