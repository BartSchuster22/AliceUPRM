import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController balance endpoint', () => {
  let controller: UsersController;

  beforeEach(() => {
    controller = new UsersController();
  });

  it('returns formatted balance using the tenant base currency', async () => {
    const tenantUser = { id: 'tu-alice' };
    const tenant = { id: 'tenant-1', baseCurrency: 'EUR' };
    const balance = { balance: -299n };

    (controller as any).svc = {
      getTenantUser: jest.fn().mockResolvedValue(tenantUser),
    };
    (controller as any).tenantSvc = {
      getTenant: jest.fn().mockResolvedValue(tenant),
    };
    (controller as any).balanceSvc = {
      getUserBalance: jest.fn().mockResolvedValue(balance),
    };

    const result = await (controller as any).balance('tu-alice', {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(result).toEqual({
      tenant_user_id: 'tu-alice',
      base_currency: 'EUR',
      balance_credits: 299,
      balance_display: '299 Credits',
      balance_as_money: {
        amount_minor: 299,
        formatted: '€2.99',
      },
    });
  });

  it('returns zero balance when the user exists but has no balance account yet', async () => {
    (controller as any).svc = {
      getTenantUser: jest.fn().mockResolvedValue({ id: 'tu-bob' }),
    };
    (controller as any).tenantSvc = {
      getTenant: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', baseCurrency: 'EUR' }),
    };
    (controller as any).balanceSvc = {
      getUserBalance: jest.fn().mockResolvedValue(null),
    };

    const result = await (controller as any).balance('tu-bob', {
      uprm: { tenantId: 'tenant-1' },
    });

    expect(result).toEqual({
      tenant_user_id: 'tu-bob',
      base_currency: 'EUR',
      balance_credits: 0,
      balance_display: '0 Credits',
      balance_as_money: {
        amount_minor: 0,
        formatted: '€0.00',
      },
    });
  });

  it('throws NotFoundException when the tenant user does not exist', async () => {
    (controller as any).svc = {
      getTenantUser: jest.fn().mockResolvedValue(null),
    };

    await expect(
      (controller as any).balance('missing-user', {
        uprm: { tenantId: 'tenant-1' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
