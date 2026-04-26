export type ViewKey =
  | 'home'
  | 'tenants'
  | 'users'
  | 'wallets'
  | 'reports'
  | 'promoters'
  | 'fraud'
  | 'settlements'
  | 'webhooks';

export const NAV_ITEMS: Array<{ key: ViewKey; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'tenants', label: 'Tenants' },
  { key: 'users', label: 'Users' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'promoters', label: 'Promoters' },
  { key: 'fraud', label: 'Fraud' },
  { key: 'settlements', label: 'Settlements' },
];
