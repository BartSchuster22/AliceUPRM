import { PromoterApplicationsController } from './promoter-applications.controller';

describe('PromoterApplicationsController admin review', () => {
  let controller: PromoterApplicationsController;

  beforeEach(() => {
    controller = new PromoterApplicationsController();
  });

  it('lists promoter applications with current promoter status metadata', async () => {
    (controller as any).svc = {
      listApplications: jest.fn().mockResolvedValue([
        {
          id: 'app-1',
          tenantId: 'tenant-1',
          tenantUserId: 'tu-1',
          status: 'submitted',
          links: [],
        },
      ]),
      getPromoterStatus: jest.fn().mockResolvedValue({
        promoterStatus: 'pending_review',
        qualificationSource: 'manual',
        manualOverride: false,
      }),
    };

    const result = await (controller as any).list();
    expect((controller as any).svc.getPromoterStatus).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantUserId: 'tu-1',
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'app-1',
        status: 'submitted',
        promoter_status: 'pending_review',
        qualification_source: 'manual',
        manual_override: false,
      }),
    ]);
  });

  it('approves an application and writes an audit row', async () => {
    (controller as any).svc = {
      approveApplication: jest.fn().mockResolvedValue({
        application: {
          id: 'app-1',
          tenantId: 'tenant-1',
          tenantUserId: 'tu-1',
          status: 'approved',
          notes: 'looks good',
        },
        profile: {
          id: 'profile-1',
          promoterStatus: 'affiliate',
          qualificationSource: 'manual',
          manualOverride: true,
          effectiveFrom: new Date('2026-04-25T00:00:00.000Z'),
          effectiveTo: null,
        },
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      admin: {
        adminUserId: 'admin-1',
        subject: 'local:admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        roles: ['super_admin'],
      },
      method: 'POST',
      route: { path: '/admin/promoter-applications/:id/approve' },
      headers: {},
    };

    const result = await (controller as any).approve(
      'app-1',
      { note: 'looks good', promoterStatus: 'affiliate' },
      req,
    );

    expect((controller as any).svc.approveApplication).toHaveBeenCalledWith({
      applicationId: 'app-1',
      adminUserId: 'admin-1',
      note: 'looks good',
      promoterStatus: 'affiliate',
    });
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 'app-1', status: 'approved' }),
    );
  });

  it('creates a promoter manually with a selected promoter type and optional note', async () => {
    (controller as any).svc = {
      manualActivatePromoter: jest.fn().mockResolvedValue({
        application: {
          id: 'app-manual-1',
          tenantId: 'tenant-psi',
          tenantUserId: 'tu-9',
          status: 'approved',
          notes: null,
          links: [],
        },
        profile: {
          id: 'profile-manual-1',
          promoterStatus: 'creator',
        },
      }),
      getPromoterStatus: jest.fn().mockResolvedValue({
        promoterStatus: 'creator',
        qualificationSource: 'manual',
        manualOverride: true,
        source: 'profile',
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      admin: {
        adminUserId: 'admin-1',
        subject: 'local:admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        roles: ['super_admin'],
      },
      method: 'POST',
      route: { path: '/admin/promoter-applications/manual-create' },
      headers: {},
    };

    const result = await (controller as any).manualCreate(
      {
        tenantId: 'tenant-psi',
        tenantUserId: 'tu-9',
        promoterStatus: 'creator',
      },
      req,
    );

    expect((controller as any).svc.manualActivatePromoter).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-psi',
        tenantUserId: 'tu-9',
        adminUserId: 'admin-1',
        promoterStatus: 'creator',
        note: undefined,
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'app-manual-1',
        status: 'approved',
        promoter_status: 'creator',
        manual_override: true,
      }),
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
  });

  it('rejects an application and writes an audit row', async () => {
    (controller as any).svc = {
      rejectApplication: jest.fn().mockResolvedValue({
        id: 'app-2',
        tenantId: 'tenant-1',
        tenantUserId: 'tu-2',
        status: 'rejected',
        notes: 'not enough proof',
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      admin: {
        adminUserId: 'admin-1',
        subject: 'local:admin',
        email: 'admin@example.com',
        displayName: 'Admin',
        roles: ['super_admin'],
      },
      method: 'POST',
      route: { path: '/admin/promoter-applications/:id/reject' },
      headers: {},
    };

    const result = await (controller as any).reject(
      'app-2',
      { note: 'not enough proof' },
      req,
    );

    expect((controller as any).svc.rejectApplication).toHaveBeenCalledWith({
      applicationId: 'app-2',
      adminUserId: 'admin-1',
      note: 'not enough proof',
    });
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 'app-2', status: 'rejected' }),
    );
  });
});
