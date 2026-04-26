import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from './dashboard-nav';

describe('dashboard nav', () => {
  it('keeps Webhooks, Promoters, Fraud, and Settlements in the menu', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      'Home',
      'Tenants',
      'Users',
      'Webhooks',
      'Promoters',
      'Fraud',
      'Settlements',
    ]);
  });
});
