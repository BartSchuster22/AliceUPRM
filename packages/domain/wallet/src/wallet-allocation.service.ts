import type { GrantLike, WalletAllocation } from './types';

export class WalletAllocationService {
  allocateFifo(grants: GrantLike[], amountCredits: bigint): WalletAllocation[] {
    if (amountCredits <= 0n) {
      throw new Error('amountCredits must be positive');
    }

    const sorted = [...grants].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    let remaining = amountCredits;
    const allocations: WalletAllocation[] = [];

    for (const grant of sorted) {
      if (remaining === 0n) break;
      if (grant.amountRemaining <= 0n) continue;
      const amount = grant.amountRemaining >= remaining ? remaining : grant.amountRemaining;
      allocations.push({
        walletGrantId: grant.id,
        issuerTenantId: grant.issuerTenantId ?? null,
        amountCredits: amount,
      });
      remaining -= amount;
    }

    if (remaining > 0n) {
      throw new Error('insufficient wallet grant balance');
    }

    return allocations;
  }
}
