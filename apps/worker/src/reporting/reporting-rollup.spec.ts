import { ReportingRollupRunner } from './reporting-rollup';

describe('ReportingRollupRunner', () => {
  it('rebuilds analytics for every tenant and updates metrics', async () => {
    const runner = new ReportingRollupRunner({
      intervalMs: 1_000,
      lookbackDays: 90,
    } as any);

    (runner as any).db = {
      tenant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
      },
    };
    (runner as any).reporting = {
      rebuildAll: jest.fn().mockResolvedValue(undefined),
    };

    await runner.runOnce();

    expect((runner as any).db.tenant.findMany).toHaveBeenCalled();
    expect((runner as any).reporting.rebuildAll).toHaveBeenCalledTimes(2);
    expect((runner as any).reporting.rebuildAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
    expect(runner.metrics.rollups).toBe(2);
    expect(runner.metrics.failures).toBe(0);
    expect(runner.metrics.lastSuccessUnix).toBeGreaterThan(0);
  });

  it('counts failures without throwing the loop away', async () => {
    const runner = new ReportingRollupRunner({
      intervalMs: 1_000,
      lookbackDays: 90,
    } as any);

    (runner as any).db = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
      },
    };
    (runner as any).reporting = {
      rebuildAll: jest.fn().mockRejectedValue(new Error('boom')),
    };

    await expect(runner.runOnce()).resolves.toBeUndefined();
    expect(runner.metrics.rollups).toBe(0);
    expect(runner.metrics.failures).toBe(1);
  });
});
