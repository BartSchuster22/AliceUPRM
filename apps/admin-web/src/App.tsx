import { useEffect, useMemo, useState } from 'react';
import {
  createManualAdjustment,
  fetchFraudCaseDetail,
  fetchFraudCases,
  fetchLedger,
  fetchPromoterApplications,
  fetchReferralTree,
  fetchSettlementCycles,
  fetchTenants,
  fetchUserDetail,
  fetchUsers,
  fetchWebhookDeliveries,
  login,
  replayWebhookDelivery,
  resolveFraudCase,
  updateTenantConfig,
  type FraudCaseDetail,
  type FraudCaseRow,
  type LedgerRow,
  type PlaceholderListResponse,
  type TenantRecord,
  type TenantUserDetail,
  type TenantUserSummary,
  type WebhookDeliveryRow,
} from './api';

type ViewKey = 'tenants' | 'users' | 'wallets' | 'promoters' | 'fraud' | 'settlements' | 'webhooks';

type ReferralRow = {
  tenantId: string;
  ancestorTenantUserId: string;
  descendantTenantUserId: string;
  depth: number;
  createdAt: string;
};

const NAV_ITEMS: Array<{ key: ViewKey; label: string }> = [
  { key: 'tenants', label: 'Tenants' },
  { key: 'users', label: 'Users' },
  { key: 'wallets', label: 'Wallets' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'promoters', label: 'Promoters' },
  { key: 'fraud', label: 'Fraud' },
  { key: 'settlements', label: 'Settlements' },
];

const TOKEN_KEY = 'uprmAdminBearerToken';
const LOGIN_PATH = '/login';
const DASHBOARD_PATH = '/';

export default function App() {
  const [email, setEmail] = useState('admin@uprm.local');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Sign in to access the UPRM admin dashboard.');
  const [view, setView] = useState<ViewKey>('tenants');
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pathname, setPathname] = useState(window.location.pathname || DASHBOARD_PATH);

  const [tenantConfigDrafts, setTenantConfigDrafts] = useState({
    rewardConfig: '{}',
    promoterConfig: '{}',
    fraudConfig: '{}',
  });

  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<TenantUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userDetail, setUserDetail] = useState<TenantUserDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [referralTree, setReferralTree] = useState<ReferralRow[]>([]);
  const [manualAdjustment, setManualAdjustment] = useState({
    amountMinor: '0',
    reasonCode: '',
    note: '',
  });

  const [promoterState, setPromoterState] = useState<PlaceholderListResponse | null>(null);
  const [fraudCases, setFraudCases] = useState<FraudCaseRow[]>([]);
  const [selectedFraudCaseId, setSelectedFraudCaseId] = useState('');
  const [fraudCaseDetail, setFraudCaseDetail] = useState<FraudCaseDetail | null>(null);
  const [fraudResolutionNote, setFraudResolutionNote] = useState('');
  const [fraudStatusFilter, setFraudStatusFilter] = useState('');
  const [fraudSeverityFilter, setFraudSeverityFilter] = useState('');
  const [settlementState, setSettlementState] = useState<PlaceholderListResponse | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRow[]>([]);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname || DASHBOARD_PATH);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
    if (stored) {
      setToken(stored);
      setIsAuthenticated(true);
    } else if (pathname !== LOGIN_PATH) {
      navigate(LOGIN_PATH, true);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadTenants(token);
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated && pathname !== LOGIN_PATH) {
      navigate(LOGIN_PATH, true);
    }
    if (isAuthenticated && pathname === LOGIN_PATH) {
      navigate(DASHBOARD_PATH, true);
    }
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (!token || !selectedTenantId) return;
    void loadUsers(token, selectedTenantId, userQuery);
  }, [token, selectedTenantId]);

  useEffect(() => {
    if (!selectedTenant) return;
    setTenantConfigDrafts({
      rewardConfig: prettyJson(selectedTenant.config?.rewardConfig ?? {}),
      promoterConfig: prettyJson(selectedTenant.config?.promoterConfig ?? {}),
      fraudConfig: prettyJson(selectedTenant.config?.fraudConfig ?? {}),
    });
  }, [selectedTenantId, tenants]);

  useEffect(() => {
    if (!token) return;
    if (view === 'webhooks') {
      void loadWebhookDeliveries(token);
    }
    if (view === 'promoters') {
      void loadPromoterState(token);
    }
    if (view === 'fraud') {
      void loadFraudState(token);
    }
    if (view === 'settlements') {
      void loadSettlementState(token);
    }
  }, [view, token, selectedTenantId, fraudStatusFilter, fraudSeverityFilter]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null,
    [selectedTenantId, tenants],
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users],
  );

  function navigate(nextPath: string, replace = false) {
    const normalized = nextPath === LOGIN_PATH ? LOGIN_PATH : DASHBOARD_PATH;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', normalized);
    setPathname(normalized);
  }

  async function loadTenants(nextToken: string) {
    setLoading(true);
    setStatus('Loading tenants…');
    try {
      const result = await fetchTenants(nextToken);
      setTenants(result);
      setSelectedTenantId((current) => current || result[0]?.id || '');
      setStatus(result.length ? `Loaded ${result.length} tenant(s).` : 'No tenants returned.');
      setIsAuthenticated(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load tenants.';
      setStatus(message);
      setTenants([]);
      setSelectedTenantId('');
      if (message.includes('401')) logout();
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers(nextToken: string, tenantId: string, query = '') {
    setLoading(true);
    setStatus('Loading users…');
    try {
      const result = await fetchUsers(nextToken, tenantId, query);
      setUsers(result);
      const chosenUserId =
        selectedUserId && result.some((user) => user.id === selectedUserId)
          ? selectedUserId
          : (result[0]?.id ?? '');
      setSelectedUserId(chosenUserId);
      if (chosenUserId) {
        await loadUserContext(nextToken, tenantId, chosenUserId);
      } else {
        setUserDetail(null);
        setLedger([]);
        setReferralTree([]);
      }
      setStatus(
        result.length ? `Loaded ${result.length} user(s).` : 'No users found for this tenant.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load users.');
      setUsers([]);
      setSelectedUserId('');
      setUserDetail(null);
      setLedger([]);
      setReferralTree([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserContext(nextToken: string, tenantId: string, tenantUserId: string) {
    if (!tenantUserId) return;
    const [detail, ledgerRows, treeRows] = await Promise.all([
      fetchUserDetail(nextToken, tenantId, tenantUserId),
      fetchLedger(nextToken, tenantId, tenantUserId),
      fetchReferralTree(nextToken, tenantId, tenantUserId),
    ]);
    setUserDetail(detail);
    setLedger(ledgerRows);
    setReferralTree(treeRows as ReferralRow[]);
  }

  async function submitLogin() {
    setLoading(true);
    setStatus('Signing in…');
    try {
      const result = await login(email, password);
      window.localStorage.setItem(TOKEN_KEY, result.access_token);
      setToken(result.access_token);
      setPassword('');
      setIsAuthenticated(true);
      setStatus(
        `Signed in as ${result.admin.display_name || result.admin.email || result.admin.subject}.`,
      );
      navigate(DASHBOARD_PATH);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Login failed.');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setPassword('');
    setTenants([]);
    setUsers([]);
    setUserDetail(null);
    setLedger([]);
    setReferralTree([]);
    setSelectedTenantId('');
    setSelectedUserId('');
    setIsAuthenticated(false);
    setStatus('Signed out.');
    navigate(LOGIN_PATH);
  }

  async function saveTenantConfig() {
    if (!token || !selectedTenant) return;
    setLoading(true);
    try {
      const rewardConfig = parseConfigDraft(tenantConfigDrafts.rewardConfig, 'Reward config');
      const promoterConfig = parseConfigDraft(tenantConfigDrafts.promoterConfig, 'Promoter config');
      const fraudConfig = parseConfigDraft(tenantConfigDrafts.fraudConfig, 'Fraud config');
      await updateTenantConfig(token, selectedTenant.id, {
        rewardConfig,
        promoterConfig,
        fraudConfig,
      });
      setStatus('Tenant config saved.');
      await loadTenants(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save tenant config.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUserSearch() {
    if (!token || !selectedTenantId) return;
    await loadUsers(token, selectedTenantId, userQuery);
  }

  async function selectUserAndLoad(tenantUserId: string) {
    if (!token || !selectedTenantId) return;
    setSelectedUserId(tenantUserId);
    setLoading(true);
    setStatus('Loading user detail…');
    try {
      await loadUserContext(token, selectedTenantId, tenantUserId);
      setStatus('User detail loaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load user detail.');
    } finally {
      setLoading(false);
    }
  }

  async function submitManualAdjustment() {
    if (!token || !selectedTenantId || !selectedUser) return;
    setLoading(true);
    try {
      await createManualAdjustment(token, selectedUser.id, {
        tenantId: selectedTenantId,
        amountMinor: manualAdjustment.amountMinor,
        reasonCode: manualAdjustment.reasonCode,
        note: manualAdjustment.note,
      });
      setStatus('Manual balance adjustment posted.');
      setManualAdjustment({ amountMinor: '0', reasonCode: '', note: '' });
      await loadUserContext(token, selectedTenantId, selectedUser.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create manual adjustment.');
    } finally {
      setLoading(false);
    }
  }

  async function replayWebhook(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      await replayWebhookDelivery(token, id);
      setStatus('Webhook delivery replay queued.');
      await loadWebhookDeliveries(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to replay webhook delivery.');
    } finally {
      setLoading(false);
    }
  }

  async function loadWebhookDeliveries(nextToken: string) {
    try {
      const rows = await fetchWebhookDeliveries(nextToken, {
        tenantId: selectedTenantId || undefined,
      });
      setWebhookDeliveries(rows);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load webhook deliveries.');
    }
  }

  async function loadPromoterState(nextToken: string) {
    try {
      setPromoterState(await fetchPromoterApplications(nextToken));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load promoter applications.');
    }
  }

  async function loadFraudState(nextToken: string) {
    try {
      const rows = await fetchFraudCases(nextToken, {
        tenantId: selectedTenantId || undefined,
        status: fraudStatusFilter || undefined,
        severity: fraudSeverityFilter || undefined,
      });
      setFraudCases(rows);
      const nextId =
        selectedFraudCaseId && rows.some((row) => row.id === selectedFraudCaseId)
          ? selectedFraudCaseId
          : (rows[0]?.id ?? '');
      setSelectedFraudCaseId(nextId);
      if (nextId) {
        setFraudCaseDetail(await fetchFraudCaseDetail(nextToken, nextId));
      } else {
        setFraudCaseDetail(null);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load fraud cases.');
    }
  }

  async function selectFraudCase(id: string) {
    if (!token) return;
    setSelectedFraudCaseId(id);
    setLoading(true);
    try {
      setFraudCaseDetail(await fetchFraudCaseDetail(token, id));
      setStatus('Fraud case detail loaded.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load fraud case detail.');
    } finally {
      setLoading(false);
    }
  }

  async function submitFraudResolution(action: 'allow' | 'reject' | 'escalate') {
    if (!token || !selectedFraudCaseId) return;
    setLoading(true);
    try {
      const detail = await resolveFraudCase(
        token,
        selectedFraudCaseId,
        action,
        fraudResolutionNote.trim() || undefined,
      );
      setFraudCaseDetail(detail);
      setFraudResolutionNote('');
      setStatus(`Fraud case ${action} succeeded.`);
      await loadFraudState(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Failed to ${action} fraud case.`);
    } finally {
      setLoading(false);
    }
  }

  async function loadSettlementState(nextToken: string) {
    try {
      setSettlementState(await fetchSettlementCycles(nextToken));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load settlement cycles.');
    }
  }

  if (pathname === LOGIN_PATH || !isAuthenticated) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="eyebrow">UPRM Admin</div>
          <h1>Login</h1>
          <p className="muted">Sign in to continue to the admin dashboard.</p>
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@uprm.local"
              type="email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your admin password"
              type="password"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !loading) void submitLogin();
              }}
            />
          </label>
          <button className="primary" onClick={() => void submitLogin()} disabled={loading}>
            Sign in
          </button>
          <p className="muted status-text">{status}</p>
        </section>
      </main>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div>
          <div className="eyebrow">Phase 8</div>
          <h1>UPRM Backoffice</h1>
          <p className="muted">
            Authenticated admin shell for tenants, operators, and fraud review.
          </p>
        </div>

        <div className="panel-inline">
          <div>
            <div className="field-label">Signed in as</div>
            <strong>{email}</strong>
          </div>
          <button className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>

        <label className="field">
          <span>Tenant</span>
          <select
            value={selectedTenant?.id ?? ''}
            onChange={(event) => setSelectedTenantId(event.target.value)}
            disabled={!tenants.length}
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.slug})
              </option>
            ))}
          </select>
        </label>

        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={item.key === view ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <h2>{NAV_ITEMS.find((item) => item.key === view)?.label}</h2>
            <p className="muted">{status}</p>
          </div>
          <button
            className="secondary"
            onClick={() => void loadTenants(token)}
            disabled={!token || loading}
          >
            Refresh
          </button>
        </header>

        {view === 'tenants' && (
          <section className="panel-grid">
            <section className="panel">
              <h3>Tenant directory</h3>
              <ul className="tenant-list">
                {tenants.map((tenant) => (
                  <li key={tenant.id}>
                    <button
                      className={
                        tenant.id === selectedTenant?.id ? 'tenant-button active' : 'tenant-button'
                      }
                      onClick={() => setSelectedTenantId(tenant.id)}
                    >
                      <span>{tenant.name}</span>
                      <small>
                        {tenant.slug} · {tenant.baseCurrency} · {tenant.status}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h3>Tenant config editor</h3>
              {selectedTenant ? (
                <>
                  <label className="field">
                    <span>Reward config JSON</span>
                    <textarea
                      value={tenantConfigDrafts.rewardConfig}
                      rows={8}
                      onChange={(event) =>
                        setTenantConfigDrafts((current) => ({
                          ...current,
                          rewardConfig: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Promoter config JSON</span>
                    <textarea
                      value={tenantConfigDrafts.promoterConfig}
                      rows={6}
                      onChange={(event) =>
                        setTenantConfigDrafts((current) => ({
                          ...current,
                          promoterConfig: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Fraud config JSON</span>
                    <textarea
                      value={tenantConfigDrafts.fraudConfig}
                      rows={6}
                      onChange={(event) =>
                        setTenantConfigDrafts((current) => ({
                          ...current,
                          fraudConfig: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="primary"
                    onClick={() => void saveTenantConfig()}
                    disabled={loading}
                  >
                    Save config
                  </button>
                </>
              ) : (
                <p className="muted">No tenant selected.</p>
              )}
            </section>
          </section>
        )}

        {view === 'users' && (
          <section className="panel-grid panel-grid-wide">
            <section className="panel">
              <h3>User search</h3>
              <div className="toolbar-inline">
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Search by email, username, or external user id"
                />
                <button
                  className="secondary"
                  onClick={() => void handleUserSearch()}
                  disabled={!selectedTenantId || loading}
                >
                  Search
                </button>
              </div>
              <ul className="tenant-list compact-list">
                {users.map((user) => (
                  <li key={user.id}>
                    <button
                      className={
                        user.id === selectedUser?.id ? 'tenant-button active' : 'tenant-button'
                      }
                      onClick={() => void selectUserAndLoad(user.id)}
                    >
                      <span>{user.email || user.external_user_id}</span>
                      <small>
                        {user.username || 'no username'} · {user.external_user_id}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h3>User detail</h3>
              {userDetail ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>Email</dt>
                      <dd>{userDetail.tenant_user.email || '—'}</dd>
                    </div>
                    <div>
                      <dt>External user id</dt>
                      <dd>{userDetail.tenant_user.external_user_id}</dd>
                    </div>
                    <div>
                      <dt>Username</dt>
                      <dd>{userDetail.tenant_user.username || '—'}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{userDetail.tenant_user.tenant_status}</dd>
                    </div>
                    <div>
                      <dt>Joined</dt>
                      <dd>{formatDate(userDetail.tenant_user.joined_at)}</dd>
                    </div>
                    <div>
                      <dt>Wallet</dt>
                      <dd>
                        {userDetail.balance
                          ? `${userDetail.balance.display_balance_minor} ${userDetail.balance.currency}`
                          : 'No balance yet'}
                      </dd>
                    </div>
                  </dl>
                  <h4>Referral tree</h4>
                  {referralTree.length ? (
                    <ul className="data-list">
                      {referralTree.map((row) => (
                        <li
                          key={`${row.ancestorTenantUserId}-${row.descendantTenantUserId}-${row.depth}`}
                        >
                          depth {row.depth}: {row.ancestorTenantUserId} →{' '}
                          {row.descendantTenantUserId}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No referral tree rows for this user.</p>
                  )}
                  <h4>Promoter history</h4>
                  <p className="muted">
                    Promoter history is not available yet because promoter profile/history tables do
                    not exist in the current UPRM domain.
                  </p>
                </>
              ) : (
                <p className="muted">Select a user to inspect details.</p>
              )}
            </section>
          </section>
        )}

        {view === 'wallets' && (
          <section className="panel-grid panel-grid-wide">
            <section className="panel">
              <h3>Manual balance adjustment</h3>
              {selectedUser ? (
                <>
                  <p className="muted">
                    Selected user: {selectedUser.email || selectedUser.external_user_id}
                  </p>
                  <label className="field">
                    <span>Amount minor</span>
                    <input
                      value={manualAdjustment.amountMinor}
                      onChange={(event) =>
                        setManualAdjustment((current) => ({
                          ...current,
                          amountMinor: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Reason code</span>
                    <input
                      value={manualAdjustment.reasonCode}
                      onChange={(event) =>
                        setManualAdjustment((current) => ({
                          ...current,
                          reasonCode: event.target.value,
                        }))
                      }
                      placeholder="support_bonus / correction / promo_credit"
                    />
                  </label>
                  <label className="field">
                    <span>Note</span>
                    <input
                      value={manualAdjustment.note}
                      onChange={(event) =>
                        setManualAdjustment((current) => ({ ...current, note: event.target.value }))
                      }
                      placeholder="Optional note"
                    />
                  </label>
                  <button
                    className="primary"
                    onClick={() => void submitManualAdjustment()}
                    disabled={loading || !manualAdjustment.reasonCode.trim()}
                  >
                    Post manual adjustment
                  </button>
                </>
              ) : (
                <p className="muted">Select a user from the Users page first.</p>
              )}
            </section>

            <section className="panel">
              <h3>Ledger statement</h3>
              {ledger.length ? (
                <ul className="data-list">
                  {ledger.map((row) => (
                    <li key={row.posting_id}>
                      <strong>
                        {row.amount_minor} {row.currency}
                      </strong>{' '}
                      · {row.account_type}
                      <br />
                      <span className="muted">
                        {row.description} · {formatDate(row.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No ledger postings for the selected user yet.</p>
              )}
            </section>
          </section>
        )}

        {view === 'webhooks' && (
          <section className="panel">
            <h3>Webhook deliveries</h3>
            {webhookDeliveries.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Attempts</th>
                      <th>Endpoint</th>
                      <th>Last status</th>
                      <th>Last error</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookDeliveries.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.event_type}</td>
                        <td>{row.status}</td>
                        <td>{row.attempt_count}</td>
                        <td>{row.endpoint_url}</td>
                        <td>{row.last_status_code ?? '—'}</td>
                        <td>{row.last_error || '—'}</td>
                        <td>
                          <button
                            className="secondary"
                            onClick={() => void replayWebhook(row.id)}
                            disabled={loading}
                          >
                            Replay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No webhook deliveries recorded yet.</p>
            )}
          </section>
        )}

        {view === 'promoters' && renderPlaceholderPanel('Promoter applications', promoterState)}
        {view === 'fraud' && (
          <section className="panel-grid panel-grid-wide">
            <section className="panel">
              <h3>Fraud case queue</h3>
              <div className="toolbar-inline">
                <select
                  value={fraudStatusFilter}
                  onChange={(event) => setFraudStatusFilter(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="escalated">Escalated</option>
                  <option value="allowed">Allowed</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select
                  value={fraudSeverityFilter}
                  onChange={(event) => setFraudSeverityFilter(event.target.value)}
                >
                  <option value="">All severities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              {fraudCases.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Opened</th>
                        <th>User</th>
                        <th>Status</th>
                        <th>Severity</th>
                        <th>Score</th>
                        <th>Holds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fraudCases.map((row) => (
                        <tr key={row.id} onClick={() => void selectFraudCase(row.id)}>
                          <td>{formatDate(row.opened_at)}</td>
                          <td>{row.tenant_user_id || '—'}</td>
                          <td>{row.status}</td>
                          <td>{row.severity}</td>
                          <td>{row.score_total}</td>
                          <td>{row.hold_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No fraud cases found for the current filters.</p>
              )}
            </section>
            <section className="panel">
              <h3>Fraud case detail</h3>
              {fraudCaseDetail ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>Status</dt>
                      <dd>{fraudCaseDetail.status}</dd>
                    </div>
                    <div>
                      <dt>Severity</dt>
                      <dd>{fraudCaseDetail.severity}</dd>
                    </div>
                    <div>
                      <dt>Score</dt>
                      <dd>{fraudCaseDetail.score_total}</dd>
                    </div>
                    <div>
                      <dt>Holds</dt>
                      <dd>{fraudCaseDetail.hold_count}</dd>
                    </div>
                  </dl>
                  <label className="field">
                    <span>Reviewer note</span>
                    <textarea
                      value={fraudResolutionNote}
                      rows={4}
                      onChange={(event) => setFraudResolutionNote(event.target.value)}
                    />
                  </label>
                  <div className="toolbar-inline">
                    <button
                      className="primary"
                      onClick={() => void submitFraudResolution('allow')}
                      disabled={loading}
                    >
                      Allow
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void submitFraudResolution('reject')}
                      disabled={loading}
                    >
                      Reject
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void submitFraudResolution('escalate')}
                      disabled={loading}
                    >
                      Escalate
                    </button>
                  </div>
                  <h4>Signals</h4>
                  {fraudCaseDetail.related_signals.length ? (
                    <ul className="data-list">
                      {fraudCaseDetail.related_signals.map((signal) => (
                        <li key={signal.id}>
                          <strong>{signal.signal_type}</strong> · score {signal.score} ·{' '}
                          {signal.severity}
                          <br />
                          <span className="muted">{JSON.stringify(signal.metadata)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No related signals recorded.</p>
                  )}
                  <h4>Reward holds</h4>
                  {fraudCaseDetail.reward_holds.length ? (
                    <ul className="data-list">
                      {fraudCaseDetail.reward_holds.map((hold) => (
                        <li key={hold.id}>
                          {hold.scheduled_posting_id} · {hold.status} · {hold.reason_code}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No reward holds on this case.</p>
                  )}
                  <h4>Case history</h4>
                  {fraudCaseDetail.events.length ? (
                    <ul className="data-list">
                      {fraudCaseDetail.events.map((event) => (
                        <li key={event.id}>
                          <strong>{event.action}</strong> · {event.actor_type} ·{' '}
                          {formatDate(event.created_at)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No case events recorded.</p>
                  )}
                </>
              ) : (
                <p className="muted">Select a fraud case to inspect and resolve it.</p>
              )}
            </section>
          </section>
        )}
        {view === 'settlements' && renderPlaceholderPanel('Settlement cycles', settlementState)}
      </main>
    </div>
  );
}

function renderPlaceholderPanel(title: string, state: PlaceholderListResponse | null) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="muted">{state?.message || 'Loading…'}</p>
      <p className="muted">
        This screen is wired and reachable, but the underlying domain is not implemented in the
        current UPRM backend yet.
      </p>
    </section>
  );
}

function parseConfigDraft(raw: string, label: string) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) throw error;
    throw new Error(`${label} is not valid JSON.`);
  }
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
