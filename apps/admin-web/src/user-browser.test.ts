import { describe, expect, it } from 'vitest';
import { combineUserRows } from './user-browser';

describe('user-browser helpers', () => {
  it('combines per-tenant user lists and attaches tenant labels while sorting active users first', () => {
    const rows = combineUserRows(
      [
        { id: 'tenant-psi', name: 'PSI', slug: 'psi', status: 'active', baseCurrency: 'EUR' },
        { id: 'tenant-omega', name: 'Omega', slug: 'omega', status: 'active', baseCurrency: 'EUR' },
      ],
      [
        {
          tenantId: 'tenant-omega',
          users: [
            {
              id: 'u2',
              tenant_id: 'tenant-omega',
              user_id: 'user-2',
              external_user_id: 'bob',
              username: 'Bob',
              tenant_status: 'inactive',
              entity_type: 'person',
              source_tenant_id: null,
              source_tenant_user_id: null,
              joined_at: '2026-04-01T00:00:00.000Z',
              metadata: {},
              email: 'bob@example.com',
              email_verified: true,
            },
          ],
        },
        {
          tenantId: 'tenant-psi',
          users: [
            {
              id: 'u1',
              tenant_id: 'tenant-psi',
              user_id: 'user-1',
              external_user_id: 'alice',
              username: 'Alice',
              tenant_status: 'active',
              entity_type: 'person',
              source_tenant_id: null,
              source_tenant_user_id: null,
              joined_at: '2026-04-01T00:00:00.000Z',
              metadata: {},
              email: 'alice@example.com',
              email_verified: true,
            },
          ],
        },
      ],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'u1',
        tenant_name: 'PSI',
        tenant_slug: 'psi',
        tenant_status: 'active',
      }),
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({
        id: 'u2',
        tenant_name: 'Omega',
        tenant_slug: 'omega',
        tenant_status: 'inactive',
      }),
    );
  });
});
