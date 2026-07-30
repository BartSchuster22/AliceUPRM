import type { ReportingService } from '@uprm/reporting';
import { ReportingRollupRunner } from './reporting-rollup';

const findMany = jest.fn<Promise<Array<{ id: string }>>, []>();
const rebuildAll = jest.fn<
  ReturnType<ReportingService['rebuildAll']>,
  Parameters<ReportingService['rebuildAll']>
>();

function makeRunner(): ReportingRollupRunner {
  return new ReportingRollupRunner(
    { intervalMs: 1_000, lookbackDays: 90 },
    {
      db: { tenant: { findMany } },
      reporting: { rebuildAll },
    },
  );
}

describe('ReportingRollupRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rebuilds analytics for every tenant and updates metrics', async () => {
    const runner = makeRunner();
    findMany.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]);
    rebuildAll.mockResolvedValue(
      {} as Awaited<ReturnType<ReportingService['rebuildAll']>>,
    );

    await runner.runOnce();

    expect(findMany).toHaveBeenCalled();
    expect(rebuildAll).toHaveBeenCalledTimes(2);
    expect(rebuildAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
    expect(runner.metrics.rollups).toBe(2);
    expect(runner.metrics.failures).toBe(0);
    expect(runner.metrics.lastSuccessUnix).toBeGreaterThan(0);
  });

  it('counts failures without throwing the loop away', async () => {
    const runner = makeRunner();
    findMany.mockResolvedValue([{ id: 'tenant-1' }]);
    rebuildAll.mockRejectedValue(new Error('boom'));

    await expect(runner.runOnce()).resolves.toBeUndefined();
    expect(runner.metrics.rollups).toBe(0);
    expect(runner.metrics.failures).toBe(1);
  });
});
