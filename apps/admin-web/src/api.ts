export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  baseCurrency: string;
  config?: Record<string, unknown>;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  admin: {
    id: string;
    subject: string;
    email: string | null;
    display_name: string | null;
    roles: string[];
  };
}

export interface TenantUserSummary {
  id: string;
  tenant_id: string;
  user_id: string;
  external_user_id: string;
  username: string | null;
  tenant_status: string;
  entity_type: string;
  source_tenant_id: string | null;
  source_tenant_user_id: string | null;
  joined_at: string;
  metadata: Record<string, unknown>;
  email: string | null;
  email_verified: boolean;
}

export interface TenantUserDetail {
  tenant_user: TenantUserSummary;
  source_tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  source_user: {
    id: string;
    tenant_id: string;
    user_id: string;
    external_user_id: string;
    username: string | null;
    entity_type: string;
    email: string | null;
  } | null;
  balance: {
    account_id: string;
    account_type: string;
    currency: string;
    raw_balance_minor: string;
    display_balance_minor: string;
  } | null;
  payouts: Array<{
    id: string;
    amount_minor: string;
    base_currency: string;
    status: string;
    payout_method: string;
    created_at: string;
  }>;
}

export interface LedgerRow {
  posting_id: string;
  created_at: string;
  amount_minor: string;
  currency: string;
  account_id: string;
  account_type: string;
  entry_id: string;
  description: string;
  idempotency_key: string;
  source_event_id: string | null;
}

export interface PromoterApplicationRow {
  id: string;
  tenant_id: string;
  tenant_user_id: string;
  status: string;
  notes: string | null;
  submitted_at: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: string | null;
  links: Array<{
    id: string;
    link_type: string;
    url: string;
    verification_status: string;
    proof_json: Record<string, unknown> | null;
  }>;
}

export interface SettlementCycleRow {
  id: string;
  tenant_id: string;
  currency: string;
  status: string;
  period_start: string;
  period_end: string;
  ledger_liability_minor: string | null;
  pending_liability_minor: string | null;
  total_liability_minor: string | null;
  note: string | null;
  opened_by_admin_id: string | null;
  opened_at: string | null;
  closed_by_admin_id: string | null;
  closed_at: string | null;
}

export interface FraudCaseRow {
  id: string;
  tenant_id: string;
  tenant_user_id: string | null;
  status: string;
  severity: string;
  score_total: number;
  hold_count: number;
  resolution: string | null;
  resolution_note: string | null;
  opened_by_signal_id: string | null;
  opened_at: string;
  resolved_at: string | null;
  threshold_snapshot: Record<string, unknown>;
}

export interface FraudCaseDetail extends FraudCaseRow {
  opened_by_signal: {
    id: string;
    signalType: string;
    score: number;
    severity: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  } | null;
  reward_holds: Array<{
    id: string;
    scheduled_posting_id: string;
    status: string;
    reason_code: string;
    created_at: string;
    released_at: string | null;
    rejected_at: string | null;
  }>;
  related_signals: Array<{
    id: string;
    signal_type: string;
    score: number;
    severity: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    actor_type: string;
    actor_id: string | null;
    action: string;
    before_json: Record<string, unknown> | null;
    after_json: Record<string, unknown> | null;
    created_at: string;
  }>;
}

export interface WebhookDeliveryRow {
  id: string;
  tenant_id: string;
  event_type: string;
  endpoint_url: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  source_topic: string | null;
  source_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportsOverview {
  tenant_id: string;
  range_days: number;
  conversion_daily: Array<{
    day: string;
    event_type: string;
    event_count: number;
    distinct_external_users: number;
    distinct_tenant_users: number;
  }>;
  reward_performance_daily: Array<{
    day: string;
    currency: string;
    reward_entry_count: number;
    reward_expense_minor: string;
    distinct_beneficiary_users: number;
    posted_scheduled_count: number;
  }>;
  tenant_liability_daily: Array<{
    day: string;
    currency: string;
    raw_liability_minor: string;
    display_liability_minor: string;
    account_count: number;
  }>;
  cohort_retention_daily: Array<{
    cohort_day: string;
    activity_day: string;
    cohort_size: number;
    retained_users: number;
  }>;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchTenants(token: string): Promise<TenantRecord[]> {
  return request('/admin/tenants', {
    headers: authHeaders(token),
  });
}

export async function updateTenantConfig(
  token: string,
  tenantId: string,
  payload: {
    rewardConfig?: Record<string, unknown>;
    promoterConfig?: Record<string, unknown>;
    fraudConfig?: Record<string, unknown>;
  },
) {
  return request(`/admin/tenants/${tenantId}/config`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchUsers(
  token: string,
  tenantId: string,
  query = '',
): Promise<TenantUserSummary[]> {
  const params = new URLSearchParams({ tenantId });
  if (query.trim()) params.set('q', query.trim());
  return request(`/admin/users?${params.toString()}`, {
    headers: authHeaders(token),
  });
}

export async function fetchUserDetail(
  token: string,
  tenantId: string,
  tenantUserId: string,
): Promise<TenantUserDetail> {
  const params = new URLSearchParams({ tenantId });
  return request(`/admin/users/${tenantUserId}?${params.toString()}`, {
    headers: authHeaders(token),
  });
}

export async function fetchLedger(
  token: string,
  tenantId: string,
  tenantUserId: string,
): Promise<LedgerRow[]> {
  const params = new URLSearchParams({ tenantId });
  return request(`/admin/users/${tenantUserId}/ledger?${params.toString()}`, {
    headers: authHeaders(token),
  });
}

export async function fetchReferralTree(
  token: string,
  tenantId: string,
  tenantUserId: string,
  depth = 3,
) {
  const params = new URLSearchParams({ tenantId, depth: String(depth) });
  return request(`/admin/users/${tenantUserId}/referral-tree?${params.toString()}`, {
    headers: authHeaders(token),
  });
}

export async function createManualAdjustment(
  token: string,
  tenantUserId: string,
  payload: {
    tenantId: string;
    amountMinor: string;
    currency?: string;
    reasonCode: string;
    note?: string;
  },
) {
  return request(`/admin/users/${tenantUserId}/manual-adjustments`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchPromoterApplications(token: string): Promise<PromoterApplicationRow[]> {
  return request('/admin/promoter-applications', { headers: authHeaders(token) });
}

export async function reviewPromoterApplication(
  token: string,
  id: string,
  action: 'approve' | 'reject',
  note?: string,
) {
  return request(`/admin/promoter-applications/${id}/${action}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function fetchFraudCases(
  token: string,
  filters: { tenantId?: string; status?: string; severity?: string } = {},
): Promise<FraudCaseRow[]> {
  const params = new URLSearchParams();
  if (filters.tenantId) params.set('tenantId', filters.tenantId);
  if (filters.status) params.set('status', filters.status);
  if (filters.severity) params.set('severity', filters.severity);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request(`/admin/fraud-cases${suffix}`, { headers: authHeaders(token) });
}

export async function fetchFraudCaseDetail(token: string, id: string): Promise<FraudCaseDetail> {
  return request(`/admin/fraud-cases/${id}`, { headers: authHeaders(token) });
}

export async function resolveFraudCase(
  token: string,
  id: string,
  action: 'allow' | 'reject' | 'escalate',
  note?: string,
): Promise<FraudCaseDetail> {
  return request(`/admin/fraud-cases/${id}/${action}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function fetchSettlementCycles(token: string): Promise<SettlementCycleRow[]> {
  return request('/admin/settlement-cycles', { headers: authHeaders(token) });
}

export async function openSettlementCycle(
  token: string,
  payload: { tenantId: string; note?: string },
) {
  return request('/admin/settlement-cycles/open', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function closeSettlementCycle(token: string, id: string, note?: string) {
  return request(`/admin/settlement-cycles/${id}/close`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function fetchWebhookDeliveries(
  token: string,
  filters: { tenantId?: string; status?: string; eventType?: string } = {},
): Promise<WebhookDeliveryRow[]> {
  const params = new URLSearchParams();
  if (filters.tenantId) params.set('tenantId', filters.tenantId);
  if (filters.status) params.set('status', filters.status);
  if (filters.eventType) params.set('eventType', filters.eventType);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request(`/admin/webhook-deliveries${suffix}`, { headers: authHeaders(token) });
}

export async function replayWebhookDelivery(token: string, id: string) {
  return request(`/admin/webhook-deliveries/${id}/replay`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function fetchReports(
  token: string,
  tenantId: string,
  days = 30,
): Promise<ReportsOverview> {
  const params = new URLSearchParams({ tenantId, days: String(days) });
  return request(`/admin/reports/overview?${params.toString()}`, {
    headers: authHeaders(token),
  });
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = await safeRead(response);
    throw new Error(body || `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return null;
  }
  const text = await safeRead(response);
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text);
}

async function safeRead(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
