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
  joined_at: string;
  metadata: Record<string, unknown>;
  email: string | null;
  email_verified: boolean;
}

export interface TenantUserDetail {
  tenant_user: TenantUserSummary;
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

export interface PlaceholderListResponse {
  items: unknown[];
  status: string;
  message: string;
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

export async function fetchPromoterApplications(token: string): Promise<PlaceholderListResponse> {
  return request('/admin/promoter-applications', { headers: authHeaders(token) });
}

export async function fetchFraudCases(token: string): Promise<PlaceholderListResponse> {
  return request('/admin/fraud-cases', { headers: authHeaders(token) });
}

export async function fetchSettlementCycles(token: string): Promise<PlaceholderListResponse> {
  return request('/admin/settlement-cycles', { headers: authHeaders(token) });
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
  return response.json();
}

async function safeRead(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
