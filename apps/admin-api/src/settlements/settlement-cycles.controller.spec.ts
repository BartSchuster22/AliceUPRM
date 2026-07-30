import { NotFoundException } from '@nestjs/common';
import { SettlementCyclesController } from './settlement-cycles.controller';

describe('SettlementCyclesController', () => {
  let controller: SettlementCyclesController;

  beforeEach(() => {
    controller = new SettlementCyclesController();
  });

  it('lists settlement cycles', async () => {
    (controller as any).svc = {
      listCycles: jest.fn().mockResolvedValue([
        {
          id: 'cycle-1',
          tenantId: 'tenant-1',
          currency: 'EUR',
          status: 'open',
          ledgerLiabilityMinor: 299n,
          pendingLiabilityMinor: 25n,
          totalLiabilityMinor: 324n,
        },
      ]),
    };

    const result = await (controller as any).list('tenant-1', 'open');
    expect((controller as any).svc.listCycles).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: 'open',
    });
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 'cycle-1', status: 'open' }),
    );
  });

  it('opens a settlement cycle and writes audit', async () => {
    (controller as any).svc = {
      openCycle: jest.fn().mockResolvedValue({
        id: 'cycle-1',
        tenantId: 'tenant-1',
        currency: 'EUR',
        status: 'open',
        ledgerLiabilityMinor: 299n,
        pendingLiabilityMinor: 25n,
        totalLiabilityMinor: 324n,
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
      route: { path: '/admin/settlement-cycles/open' },
      headers: {},
    };

    const result = await (controller as any).open(
      { tenantId: 'tenant-1', note: 'open it' },
      req,
    );

    expect((controller as any).svc.openCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        adminUserId: 'admin-1',
        note: 'open it',
      }),
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 'cycle-1', status: 'open' }),
    );
  });

  it('closes a settlement cycle and writes audit', async () => {
    (controller as any).svc = {
      getCycle: jest.fn().mockResolvedValue({
        id: 'cycle-1',
        tenantId: 'tenant-1',
        status: 'open',
      }),
      closeCycle: jest.fn().mockResolvedValue({
        id: 'cycle-1',
        tenantId: 'tenant-1',
        currency: 'EUR',
        status: 'closed',
        ledgerLiabilityMinor: 100n,
        pendingLiabilityMinor: 0n,
        totalLiabilityMinor: 100n,
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
      route: { path: '/admin/settlement-cycles/:id/close' },
      headers: {},
    };

    const result = await (controller as any).close(
      'cycle-1',
      { note: 'close it' },
      req,
    );

    expect((controller as any).svc.closeCycle).toHaveBeenCalledWith({
      id: 'cycle-1',
      adminUserId: 'admin-1',
      note: 'close it',
    });
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 'cycle-1', status: 'closed' }),
    );
  });

  it('throws when settlement cycle detail is missing', async () => {
    (controller as any).svc = { getCycle: jest.fn().mockResolvedValue(null) };
    await expect((controller as any).detail('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
