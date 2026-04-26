import { describe, expect, it } from 'vitest';
import { buildPromoterApplicationRows, summarizePromoterPerformance } from './promoter-browser';

describe('promoter-browser helpers', () => {
  it('filters promoter rows by tenant/status and ranks by real promoter performance totals when selected', () => {
    const rows = buildPromoterApplicationRows(
      [
        {
          id: 'app-1',
          tenant_id: 'tenant-psi',
          tenant_user_id: 'tu-1',
          status: 'submitted',
          promoter_status: 'pending_review',
          notes: null,
          submitted_at: '2026-04-26T10:00:00.000Z',
          reviewed_by_admin_id: null,
          reviewed_at: null,
          links: [],
        },
        {
          id: 'app-2',
          tenant_id: 'tenant-psi',
          tenant_user_id: 'tu-2',
          status: 'approved',
          promoter_status: 'affiliate',
          notes: null,
          submitted_at: '2026-04-25T10:00:00.000Z',
          reviewed_by_admin_id: 'admin-1',
          reviewed_at: '2026-04-25T11:00:00.000Z',
          links: [],
        },
        {
          id: 'app-3',
          tenant_id: 'tenant-omega',
          tenant_user_id: 'tu-3',
          status: 'approved',
          promoter_status: 'creator',
          notes: null,
          submitted_at: '2026-04-24T10:00:00.000Z',
          reviewed_by_admin_id: 'admin-1',
          reviewed_at: '2026-04-24T11:00:00.000Z',
          links: [],
        },
      ],
      [
        {
          id: 'tu-1',
          tenant_id: 'tenant-psi',
          username: 'Alice',
          email: 'alice@example.com',
          external_user_id: 'alice',
          tenant_name: 'PSI',
          tenant_slug: 'psi',
        },
        {
          id: 'tu-2',
          tenant_id: 'tenant-psi',
          username: 'Bob',
          email: 'bob@example.com',
          external_user_id: 'bob',
          tenant_name: 'PSI',
          tenant_slug: 'psi',
        },
        {
          id: 'tu-3',
          tenant_id: 'tenant-omega',
          username: 'Cara',
          email: 'cara@example.com',
          external_user_id: 'cara',
          tenant_name: 'Omega',
          tenant_slug: 'omega',
        },
      ],
      {
        'app-1': {
          reward_total_minor: 50,
          paid_referrals: 1,
        },
        'app-2': {
          reward_total_minor: 450,
          paid_referrals: 5,
        },
        'app-3': {
          reward_total_minor: 900,
          paid_referrals: 9,
        },
      },
      {
        tenantId: 'tenant-psi',
        status: '',
        rankBy: 'reward_performance',
      },
    );

    expect(rows.map((row) => row.id)).toEqual(['app-2', 'app-1']);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        user_label: 'Bob',
        tenant_label: 'PSI (psi)',
        promoter_status: 'affiliate',
        reward_total_minor: 450,
        paid_referrals: 5,
      }),
    );
  });

  it('summarizes promoter performance totals for the detail screen', () => {
    expect(
      summarizePromoterPerformance({
        tenant_id: 'tenant-psi',
        tenant_user_id: 'tu-2',
        days: 30,
        metrics_daily: [
          {
            date: '2026-04-24T00:00:00.000Z',
            new_paid_referrals_count: 2,
            gross_revenue_referred: '300',
            net_reward_generated: '75',
            refund_count: 1,
          },
          {
            date: '2026-04-25T00:00:00.000Z',
            new_paid_referrals_count: 3,
            gross_revenue_referred: '200',
            net_reward_generated: '25',
            refund_count: 0,
          },
        ],
      }),
    ).toEqual({
      paid_referrals: 5,
      gross_revenue_minor: 500,
      reward_total_minor: 100,
      refund_count: 1,
      active_days: 2,
    });
  });
});
