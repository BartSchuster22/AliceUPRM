import { describe, expect, it } from 'vitest';
import { WalletFxService } from './wallet-fx.service';

describe('WalletFxService', () => {
  const svc = new WalletFxService();

  it('maps EUR cents 1:1 into Credits', () => {
    const result = svc.normalizeToCredits({ amount: '10.00', currency: 'EUR' });
    expect(result.eurMinor).toBe(1000n);
    expect(result.credits).toBe(1000n);
  });

  it('normalizes non-EUR input through provided EUR rate', () => {
    const result = svc.normalizeToCredits({ amount: '10.00', currency: 'USD', eurRate: '0.90' });
    expect(result.eurMinor).toBe(900n);
    expect(result.credits).toBe(900n);
  });
});
