export interface PromoterListFilters {
  tenantId: string;
  status: string;
  rankBy: 'activity_time' | 'reward_performance';
}

export interface PromoterPerformanceSummary {
  paid_referrals: number;
  gross_revenue_minor: number;
  reward_total_minor: number;
  refund_count: number;
  active_days: number;
}

export interface PromoterApplicationLinkRow {
  id: string;
  link_type: string;
  url: string;
  verification_status: string;
  proof_json: Record<string, unknown> | null;
}

export interface PromoterApplicationListRow {
  id: string;
  tenant_id: string;
  tenant_user_id: string;
  status: string;
  promoter_status: string;
  notes: string | null;
  submitted_at: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: string | null;
  links: PromoterApplicationLinkRow[];
  user_label: string;
  tenant_label: string;
  reward_total_minor: number;
  paid_referrals: number;
  links_count: number;
}

interface ApplicationLike {
  id: string;
  tenant_id: string;
  tenant_user_id: string;
  status: string;
  promoter_status?: string | null;
  notes: string | null;
  submitted_at: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: string | null;
  links?: unknown[];
}

interface UserLike {
  id: string;
  tenant_id: string;
  username: string | null;
  email: string | null;
  external_user_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
}

export function buildPromoterApplicationRows(
  applications: ApplicationLike[],
  userDirectory: UserLike[],
  performanceByApplicationId: Record<string, Partial<PromoterPerformanceSummary>>,
  filters: PromoterListFilters,
): PromoterApplicationListRow[] {
  const userById = new Map(userDirectory.map((user) => [user.id, user]));

  const rows = applications
    .filter((application) =>
      filters.tenantId === 'all' ? true : application.tenant_id === filters.tenantId,
    )
    .filter((application) => (filters.status ? application.status === filters.status : true))
    .map((application) => {
      const user = userById.get(application.tenant_user_id);
      const performance = performanceByApplicationId[application.id] ?? {};
      return {
        ...application,
        promoter_status: application.promoter_status || inferPromoterStatus(application.status),
        user_label:
          user?.username || user?.email || user?.external_user_id || application.tenant_user_id,
        tenant_label:
          user?.tenant_name && user?.tenant_slug
            ? `${user.tenant_name} (${user.tenant_slug})`
            : application.tenant_id,
        reward_total_minor: normalizeNumber(performance.reward_total_minor),
        paid_referrals: normalizeNumber(performance.paid_referrals),
        links_count: Array.isArray(application.links) ? application.links.length : 0,
      };
    });

  return rows.sort((a, b) => {
    if (filters.rankBy === 'reward_performance') {
      if (b.reward_total_minor !== a.reward_total_minor)
        return b.reward_total_minor - a.reward_total_minor;
      if (b.paid_referrals !== a.paid_referrals) return b.paid_referrals - a.paid_referrals;
    }
    return (b.submitted_at || '').localeCompare(a.submitted_at || '');
  });
}

export function summarizePromoterPerformance(performance: {
  metrics_daily: Array<{
    date: string;
    new_paid_referrals_count: number;
    gross_revenue_referred: string;
    net_reward_generated: string;
    refund_count: number;
  }>;
}): PromoterPerformanceSummary {
  return performance.metrics_daily.reduce<PromoterPerformanceSummary>(
    (summary, day) => ({
      paid_referrals: summary.paid_referrals + normalizeNumber(day.new_paid_referrals_count),
      gross_revenue_minor:
        summary.gross_revenue_minor + normalizeNumber(day.gross_revenue_referred),
      reward_total_minor: summary.reward_total_minor + normalizeNumber(day.net_reward_generated),
      refund_count: summary.refund_count + normalizeNumber(day.refund_count),
      active_days: summary.active_days + 1,
    }),
    {
      paid_referrals: 0,
      gross_revenue_minor: 0,
      reward_total_minor: 0,
      refund_count: 0,
      active_days: 0,
    },
  );
}

function inferPromoterStatus(status: string) {
  if (status === 'approved') return 'promoter';
  if (status === 'submitted' || status === 'under_review') return 'pending_review';
  if (status === 'rejected') return 'rejected';
  return status;
}

function normalizeNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}
