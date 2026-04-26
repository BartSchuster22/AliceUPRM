import { describe, expect, it } from 'vitest';
import { WalletAllocationService } from './wallet-allocation.service';

describe('WalletAllocationService', () => {
  const svc = new WalletAllocationService();

  it('allocates credits FIFO across grants', () => {
    const allocations = svc.allocateFifo(
      [
        {
          id: 'g2',
          issuerTenantId: 'tenant-2',
          amountRemaining: 300n,
          createdAt: new Date('2026-04-02T00:00:00Z'),
        },
        {
          id: 'g1',
          issuerTenantId: 'tenant-1',
          amountRemaining: 500n,
          createdAt: new Date('2026-04-01T00:00:00Z'),
        },
      ],
      700n,
    );

    expect(allocations).toEqual([
      { walletGrantId: 'g1', issuerTenantId: 'tenant-1', amountCredits: 500n },
      { walletGrantId: 'g2', issuerTenantId: 'tenant-2', amountCredits: 200n },
    ]);
  });

  it('throws when grant balance is insufficient', () => {
    expect(() =>
      svc.allocateFifo(
        [
          {
            id: 'g1',
            issuerTenantId: 'tenant-1',
            amountRemaining: 100n,
            createdAt: new Date('2026-04-01T00:00:00Z'),
          },
        ],
        101n,
      ),
    ).toThrow('insufficient wallet grant balance');
  });
});
