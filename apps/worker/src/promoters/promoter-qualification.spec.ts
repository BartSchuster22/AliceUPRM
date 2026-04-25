import { PromoterQualificationRunner } from './promoter-qualification';

jest.mock('@uprm/db', () => ({
  prisma: {
    tenant: {
      findMany: jest.fn(),
    },
  },
}));

const rollupDailyMetrics = jest.fn();
const evaluateAutoQualifications = jest.fn();

jest.mock('@uprm/promoter', () => ({
  PromoterService: jest.fn().mockImplementation(() => ({
    rollupDailyMetrics,
    evaluateAutoQualifications,
  })),
}));

describe('PromoterQualificationRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rolls up metrics and evaluates auto qualifications for each tenant', async () => {
    const { prisma } = require('@uprm/db');
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]);
    rollupDailyMetrics.mockResolvedValueOnce({ rows: 2 }).mockResolvedValueOnce({ rows: 1 });
    evaluateAutoQualifications
      .mockResolvedValueOnce({ transitions: 1 })
      .mockResolvedValueOnce({ transitions: 0 });

    const runner = new PromoterQualificationRunner({ intervalMs: 1000 });
    const asOf = new Date('2026-04-26T00:00:00.000Z');

    await runner.runOnce(asOf);

    expect(rollupDailyMetrics).toHaveBeenNthCalledWith(1, {
      tenantId: 'tenant-1',
      date: asOf,
    });
    expect(rollupDailyMetrics).toHaveBeenNthCalledWith(2, {
      tenantId: 'tenant-2',
      date: asOf,
    });
    expect(evaluateAutoQualifications).toHaveBeenCalledTimes(2);
    expect(runner.metrics.rollups).toBe(3);
    expect(runner.metrics.transitions).toBe(1);
    expect(runner.metrics.failures).toBe(0);
  });

  it('records failures without aborting later tenants', async () => {
    const { prisma } = require('@uprm/db');
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]);
    rollupDailyMetrics.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ rows: 4 });
    evaluateAutoQualifications.mockResolvedValueOnce({ transitions: 2 });

    const runner = new PromoterQualificationRunner({ intervalMs: 1000 });

    await runner.runOnce(new Date('2026-04-26T00:00:00.000Z'));

    expect(runner.metrics.failures).toBe(1);
    expect(runner.metrics.rollups).toBe(4);
    expect(runner.metrics.transitions).toBe(2);
  });
});