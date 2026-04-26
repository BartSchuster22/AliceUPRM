import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createManualAdjustment,
  closeSettlementCycle,
  fetchFraudCaseDetail,
  fetchFraudCases,
  fetchLedger,
  fetchPromoterApplications,
  fetchReferralTree,
  fetchReports,
  fetchSettlementCycles,
  fetchTenants,
  fetchUserDetail,
  fetchUsers,
  fetchWebhookDeliveries,
  login,
  openSettlementCycle,
  replayWebhookDelivery,
  resolveFraudCase,
  reviewPromoterApplication,
  updateTenantConfig,
  type FraudCaseDetail,
  type FraudCaseRow,
  type LedgerRow,
  type PromoterApplicationRow,
  type ReportsOverview,
  type SettlementCycleRow,
  type TenantRecord,
  type TenantUserDetail,
  type TenantUserSummary,
  type WebhookDeliveryRow,
} from './api';
import { RewardConfigEditor } from './RewardConfigEditor';
import { PromoterConfigEditor } from './PromoterConfigEditor';

type ViewKey =
  | 'tenants'
  | 'users'
  | 'wallets'
  | 'reports'
  | 'promoters'
  | 'fraud'
  | 'settlements'
  | 'webhooks';

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
  { key: 'reports', label: 'Reports' },
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

  const [promoterApplications, setPromoterApplications] = useState<PromoterApplicationRow[]>([]);
  const [selectedPromoterApplicationId, setSelectedPromoterApplicationId] = useState('');
  const [promoterReviewNote, setPromoterReviewNote] = useState('');
  const [reportDays, setReportDays] = useState(30);
  const [reports, setReports] = useState<ReportsOverview | null>(null);
  const [fraudCases, setFraudCases] = useState<FraudCaseRow[]>([]);
  const [selectedFraudCaseId, setSelectedFraudCaseId] = useState('');
  const [fraudCaseDetail, setFraudCaseDetail] = useState<FraudCaseDetail | null>(null);
  const [fraudResolutionNote, setFraudResolutionNote] = useState('');
  const [fraudStatusFilter, setFraudStatusFilter] = useState('');
  const [fraudSeverityFilter, setFraudSeverityFilter] = useState('');
  const [settlementCycles, setSettlementCycles] = useState<SettlementCycleRow[]>([]);
  const [selectedSettlementCycleId, setSelectedSettlementCycleId] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRow[]>([]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null,
    [selectedTenantId, tenants],
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? users[0] ?? null,
    [selectedUserId, users],
  );

  const visiblePromoterApplications = useMemo(
    () =>
      selectedTenantId
        ? promoterApplications.filter((application) => application.tenant_id === selectedTenantId)
        : promoterApplications,
    [promoterApplications, selectedTenantId],
  );

  const selectedVisiblePromoterApplication = useMemo(
    () =>
      visiblePromoterApplications.find(
        (application) => application.id === selectedPromoterApplicationId,
      ) ??
      visiblePromoterApplications[0] ??
      null,
    [visiblePromoterApplications, selectedPromoterApplicationId],
  );

  const selectedSettlementCycle = useMemo(
    () =>
      settlementCycles.find((cycle) => cycle.id === selectedSettlementCycleId) ??
      settlementCycles[0] ??
      null,
    [selectedSettlementCycleId, settlementCycles],
  );

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
  }, [selectedTenant]);

  useEffect(() => {
    if (!token) return;
    if (view === 'webhooks') {
      void loadWebhookDeliveries(token);
    }
    if (view === 'promoters') {
      void loadPromoterState(token);
    }
    if (view === 'reports') {
      void loadReports(token, selectedTenantId, reportDays);
    }
    if (view === 'fraud') {
      void loadFraudState(token);
    }
    if (view === 'settlements') {
      void loadSettlementState(token);
    }
  }, [view, token, selectedTenantId, reportDays, fraudStatusFilter, fraudSeverityFilter]);

  useEffect(() => {
    const nextSelectedId =
      visiblePromoterApplications.find(
        (application) => application.id === selectedPromoterApplicationId,
      )?.id ??
      visiblePromoterApplications[0]?.id ??
      '';

    if (nextSelectedId !== selectedPromoterApplicationId) {
      setSelectedPromoterApplicationId(nextSelectedId);
    }
  }, [visiblePromoterApplications, selectedPromoterApplicationId]);

  useEffect(() => {
    setPromoterReviewNote('');
  }, [selectedVisiblePromoterApplication?.id]);

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

  async function refreshCurrentView() {
    if (!token) return;
    if (view === 'webhooks') {
      await loadWebhookDeliveries(token);
      return;
    }
    if (view === 'promoters') {
      await loadPromoterState(token);
      return;
    }
    if (view === 'reports') {
      await loadReports(token, selectedTenantId, reportDays);
      return;
    }
    if (view === 'fraud') {
      await loadFraudState(token);
      return;
    }
    if (view === 'settlements') {
      await loadSettlementState(token);
      return;
    }
    await loadTenants(token);
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
    setReports(null);
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
      const rows = await fetchPromoterApplications(nextToken);
      setPromoterApplications(rows);
      setSelectedPromoterApplicationId((current) =>
        current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? ''),
      );
      setStatus(
        rows.length
          ? `Loaded ${rows.length} promoter application(s).`
          : 'No promoter applications found.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load promoter applications.');
      setPromoterApplications([]);
      setSelectedPromoterApplicationId('');
    }
  }

  async function submitPromoterReview(id: string, action: 'approve' | 'reject') {
    if (!token) return;
    setLoading(true);
    try {
      await reviewPromoterApplication(token, id, action, promoterReviewNote.trim() || undefined);
      setStatus(`Promoter application ${action}d.`);
      setPromoterReviewNote('');
      await loadPromoterState(token);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : `Failed to ${action} promoter application.`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadReports(nextToken: string, tenantId: string, days: number) {
    if (!tenantId) {
      setReports(null);
      return;
    }
    try {
      setReports(await fetchReports(nextToken, tenantId, days));
      setStatus(`Loaded reports for the last ${days} day(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load reports.');
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
      const rows = await fetchSettlementCycles(nextToken);
      setSettlementCycles(rows);
      setSelectedSettlementCycleId((current) => {
        if (current && rows.some((row) => row.id === current)) {
          return current;
        }
        return rows.find((row) => row.status === 'open')?.id ?? rows[0]?.id ?? '';
      });
      setStatus(
        rows.length ? `Loaded ${rows.length} settlement cycle(s).` : 'No settlement cycles found.',
      );
    } catch (error) {
      setSettlementCycles([]);
      setSelectedSettlementCycleId('');
      setStatus(error instanceof Error ? error.message : 'Failed to load settlement cycles.');
    }
  }

  async function submitOpenSettlementCycle() {
    if (!token || !selectedTenantId) return;
    setLoading(true);
    try {
      await openSettlementCycle(token, {
        tenantId: selectedTenantId,
        note: settlementNote.trim() || undefined,
      });
      setStatus('Settlement cycle opened.');
      setSettlementNote('');
      await loadSettlementState(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to open settlement cycle.');
    } finally {
      setLoading(false);
    }
  }

  async function submitCloseSettlementCycle(id: string) {
    if (!token) return;
    setLoading(true);
    try {
      await closeSettlementCycle(token, id, settlementNote.trim() || undefined);
      setStatus('Settlement cycle closed.');
      setSettlementNote('');
      await loadSettlementState(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to close settlement cycle.');
    } finally {
      setLoading(false);
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
            onClick={() => void refreshCurrentView()}
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
                  <RewardConfigEditor
                    value={tenantConfigDrafts.rewardConfig}
                    onChange={(rewardConfig) =>
                      setTenantConfigDrafts((current) => ({
                        ...current,
                        rewardConfig,
                      }))
                    }
                    disabled={loading}
                  />
                  <PromoterConfigEditor
                    value={tenantConfigDrafts.promoterConfig}
                    onChange={(promoterConfig) =>
                      setTenantConfigDrafts((current) => ({
                        ...current,
                        promoterConfig,
                      }))
                    }
                    disabled={loading}
                  />
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
                      <dt>Entity type</dt>
                      <dd>{userDetail.tenant_user.entity_type || 'person'}</dd>
                    </div>
                    <div>
                      <dt>Joined</dt>
                      <dd>{formatDate(userDetail.tenant_user.joined_at)}</dd>
                    </div>
                    <div>
                      <dt>Source tenant</dt>
                      <dd>
                        {userDetail.source_tenant
                          ? `${userDetail.source_tenant.name} (${userDetail.source_tenant.slug})`
                          : userDetail.tenant_user.source_tenant_id || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Source user</dt>
                      <dd>
                        {userDetail.source_user
                          ? `${userDetail.source_user.username || userDetail.source_user.email || userDetail.source_user.external_user_id} (${userDetail.source_user.entity_type})`
                          : userDetail.tenant_user.source_tenant_user_id || '—'}
                      </dd>
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
                    Promoter status now exists in UPRM; user-level history panel polish is still
                    pending.
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

        {view === 'reports' && (
          <section className="panel-grid panel-grid-wide">
            <section className="panel">
              <div className="toolbar-inline">
                <label className="field">
                  <span>Range (days)</span>
                  <select
                    value={reportDays}
                    onChange={(event) => setReportDays(Number(event.target.value))}
                  >
                    <option value={30}>30</option>
                    <option value={60}>60</option>
                    <option value={90}>90</option>
                  </select>
                </label>
                <button
                  className="secondary"
                  onClick={() =>
                    token &&
                    selectedTenantId &&
                    void loadReports(token, selectedTenantId, reportDays)
                  }
                  disabled={!token || !selectedTenantId || loading}
                >
                  Reload reports
                </button>
              </div>
              {reports ? (
                <>
                  <div className="detail-list">
                    <div>
                      <dt>Tenant</dt>
                      <dd>{reports.tenant_id}</dd>
                    </div>
                    <div>
                      <dt>Range</dt>
                      <dd>{reports.range_days} days</dd>
                    </div>
                    <div>
                      <dt>Total conversion events</dt>
                      <dd>
                        {reports.conversion_daily.reduce((sum, row) => sum + row.event_count, 0)}
                      </dd>
                    </div>
                    <div>
                      <dt>Current liability</dt>
                      <dd>
                        {lastItem(reports.tenant_liability_daily)?.display_liability_minor ?? '0'}{' '}
                        {lastItem(reports.tenant_liability_daily)?.currency ??
                          selectedTenant?.baseCurrency ??
                          'EUR'}
                      </dd>
                    </div>
                  </div>

                  <h3>Conversions</h3>
                  <ChartBox>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={buildConversionChartData(reports)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="invoice_paid" stroke="#2563eb" />
                        <Line type="monotone" dataKey="purchase_completed" stroke="#16a34a" />
                        <Line type="monotone" dataKey="user_registered" stroke="#9333ea" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartBox>

                  <h3>Reward performance</h3>
                  <ChartBox>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={buildRewardChartData(reports)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="rewardExpenseMinor" fill="#f59e0b" />
                        <Bar dataKey="postedScheduledCount" fill="#0f766e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>

                  <h3>Tenant liability</h3>
                  <ChartBox>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={buildLiabilityChartData(reports)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="displayLiabilityMinor" stroke="#dc2626" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartBox>

                  <h3>Cohort retention</h3>
                  <ChartBox>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={buildRetentionChartData(reports)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="cohort" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="retentionRatePercent" fill="#7c3aed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBox>
                </>
              ) : (
                <p className="muted">No reporting data loaded yet.</p>
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

        {view === 'promoters' && (
          <section className="panel-grid panel-grid-wide">
            <section className="panel">
              <h3>Promoter applications</h3>
              <p className="muted">
                Showing{' '}
                {selectedTenant ? `${selectedTenant.name} (${selectedTenant.slug})` : 'all tenants'}{' '}
                promoter applications.
              </p>
              {visiblePromoterApplications.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Submitted</th>
                        <th>Tenant user</th>
                        <th>Status</th>
                        <th>Links</th>
                        <th>Reviewed</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePromoterApplications.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            row.id === selectedVisiblePromoterApplication?.id
                              ? 'interactive-row selected'
                              : 'interactive-row'
                          }
                          onClick={() => setSelectedPromoterApplicationId(row.id)}
                        >
                          <td>{row.submitted_at ? formatDate(row.submitted_at) : '—'}</td>
                          <td>{row.tenant_user_id}</td>
                          <td>{row.status}</td>
                          <td>{row.links.length}</td>
                          <td>{row.reviewed_at ? formatDate(row.reviewed_at) : '—'}</td>
                          <td>{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No promoter applications recorded for the selected tenant yet.
                </p>
              )}
            </section>
            <section className="panel">
              <h3>Application detail</h3>
              {selectedVisiblePromoterApplication ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>ID</dt>
                      <dd>{selectedVisiblePromoterApplication.id}</dd>
                    </div>
                    <div>
                      <dt>Tenant ID</dt>
                      <dd>{selectedVisiblePromoterApplication.tenant_id}</dd>
                    </div>
                    <div>
                      <dt>Tenant user ID</dt>
                      <dd>{selectedVisiblePromoterApplication.tenant_user_id}</dd>
                    </div>
                    <div>
                      <dt>Submitted at</dt>
                      <dd>
                        {selectedVisiblePromoterApplication.submitted_at
                          ? formatDate(selectedVisiblePromoterApplication.submitted_at)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedVisiblePromoterApplication.status}</dd>
                    </div>
                    <div>
                      <dt>Reviewed at</dt>
                      <dd>
                        {selectedVisiblePromoterApplication.reviewed_at
                          ? formatDate(selectedVisiblePromoterApplication.reviewed_at)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Reviewed by admin ID</dt>
                      <dd>{selectedVisiblePromoterApplication.reviewed_by_admin_id || '—'}</dd>
                    </div>
                  </dl>
                  <div>
                    <div className="field-label">Notes</div>
                    <pre>{selectedVisiblePromoterApplication.notes || '—'}</pre>
                  </div>
                  <label className="field">
                    <span>Reviewer note</span>
                    <textarea
                      value={promoterReviewNote}
                      rows={3}
                      onChange={(event) => setPromoterReviewNote(event.target.value)}
                      placeholder="Optional note for approve/reject actions"
                    />
                  </label>
                  {(selectedVisiblePromoterApplication.status === 'submitted' ||
                    selectedVisiblePromoterApplication.status === 'under_review') && (
                    <div className="toolbar-inline">
                      <button
                        className="primary"
                        onClick={() =>
                          void submitPromoterReview(
                            selectedVisiblePromoterApplication.id,
                            'approve',
                          )
                        }
                        disabled={loading}
                      >
                        Approve
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          void submitPromoterReview(selectedVisiblePromoterApplication.id, 'reject')
                        }
                        disabled={loading}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  <div>
                    <div className="field-label">Links</div>
                    {selectedVisiblePromoterApplication.links.length ? (
                      <ul className="data-list">
                        {selectedVisiblePromoterApplication.links.map((link) => (
                          <li key={link.id}>
                            <strong>{link.link_type}</strong> · {link.verification_status}
                            <br />
                            <a href={link.url} target="_blank" rel="noreferrer">
                              {link.url}
                            </a>
                            {link.proof_json ? (
                              <>
                                <div className="field-label proof-json-label">Proof JSON</div>
                                <pre>{prettyJson(link.proof_json)}</pre>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No application links provided.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">Select a promoter application to inspect it.</p>
              )}
            </section>
          </section>
        )}
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
        {view === 'settlements' && (
          <section className="panel-grid panel-grid-wide">
            <section className="panel">
              <h3>Settlement cycles</h3>
              <div className="toolbar-inline">
                <label className="field" style={{ flex: 1 }}>
                  <span>Settlement note</span>
                  <input
                    value={settlementNote}
                    onChange={(event) => setSettlementNote(event.target.value)}
                    placeholder="Optional note for open/close actions"
                  />
                </label>
                <button
                  className="primary"
                  onClick={() => void submitOpenSettlementCycle()}
                  disabled={loading || !selectedTenantId}
                >
                  Open cycle
                </button>
              </div>
              {settlementCycles.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Opened</th>
                        <th>Status</th>
                        <th>Currency</th>
                        <th>Ledger liability</th>
                        <th>Pending liability</th>
                        <th>Total liability</th>
                        <th>Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementCycles.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            row.id === selectedSettlementCycle?.id
                              ? 'interactive-row selected'
                              : 'interactive-row'
                          }
                          onClick={() => setSelectedSettlementCycleId(row.id)}
                        >
                          <td>{row.opened_at ? formatDate(row.opened_at) : '—'}</td>
                          <td>{row.status}</td>
                          <td>{row.currency}</td>
                          <td>{row.ledger_liability_minor ?? '—'}</td>
                          <td>{row.pending_liability_minor ?? '—'}</td>
                          <td>{row.total_liability_minor ?? '—'}</td>
                          <td>{row.closed_at ? formatDate(row.closed_at) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No settlement cycles recorded yet. Use “Open cycle” to create the first one.
                </p>
              )}
            </section>
            <section className="panel">
              <h3>Settlement detail</h3>
              {selectedSettlementCycle ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>ID</dt>
                      <dd>{selectedSettlementCycle.id}</dd>
                    </div>
                    <div>
                      <dt>Tenant ID</dt>
                      <dd>{selectedSettlementCycle.tenant_id}</dd>
                    </div>
                    <div>
                      <dt>Currency</dt>
                      <dd>{selectedSettlementCycle.currency}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedSettlementCycle.status}</dd>
                    </div>
                    <div>
                      <dt>Period start</dt>
                      <dd>{formatDate(selectedSettlementCycle.period_start)}</dd>
                    </div>
                    <div>
                      <dt>Period end</dt>
                      <dd>{formatDate(selectedSettlementCycle.period_end)}</dd>
                    </div>
                    <div>
                      <dt>Ledger liability minor</dt>
                      <dd>{selectedSettlementCycle.ledger_liability_minor ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Pending liability minor</dt>
                      <dd>{selectedSettlementCycle.pending_liability_minor ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Total liability minor</dt>
                      <dd>{selectedSettlementCycle.total_liability_minor ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Opened by admin ID</dt>
                      <dd>{selectedSettlementCycle.opened_by_admin_id ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Opened at</dt>
                      <dd>
                        {selectedSettlementCycle.opened_at
                          ? formatDate(selectedSettlementCycle.opened_at)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Closed by admin ID</dt>
                      <dd>{selectedSettlementCycle.closed_by_admin_id ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Closed at</dt>
                      <dd>
                        {selectedSettlementCycle.closed_at
                          ? formatDate(selectedSettlementCycle.closed_at)
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div>
                    <div className="field-label">Note</div>
                    <pre>{selectedSettlementCycle.note || '—'}</pre>
                  </div>
                  {selectedSettlementCycle.status === 'open' && (
                    <div className="toolbar-inline">
                      <button
                        className="secondary"
                        onClick={() => void submitCloseSettlementCycle(selectedSettlementCycle.id)}
                        disabled={loading}
                      >
                        Close cycle
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Select a settlement cycle to inspect it.</p>
              )}
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

function ChartBox({ children }: { children: ReactNode }) {
  return <div style={{ width: '100%', height: 260 }}>{children}</div>;
}

function buildConversionChartData(reports: ReportsOverview) {
  const byDay = new Map<string, Record<string, number | string>>();
  for (const row of reports.conversion_daily) {
    if (!byDay.has(row.day)) byDay.set(row.day, { day: shortDay(row.day) });
    byDay.get(row.day)![row.event_type] = row.event_count;
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, value]) => value);
}

function buildRewardChartData(reports: ReportsOverview) {
  return reports.reward_performance_daily.map((row) => ({
    day: shortDay(row.day),
    rewardExpenseMinor: Number(row.reward_expense_minor),
    postedScheduledCount: row.posted_scheduled_count,
  }));
}

function buildLiabilityChartData(reports: ReportsOverview) {
  return reports.tenant_liability_daily.map((row) => ({
    day: shortDay(row.day),
    displayLiabilityMinor: Number(row.display_liability_minor),
  }));
}

function buildRetentionChartData(reports: ReportsOverview) {
  const latestByCohort = new Map<string, { cohort: string; retentionRatePercent: number }>();
  for (const row of reports.cohort_retention_daily) {
    const rate =
      row.cohort_size > 0 ? Number(((row.retained_users / row.cohort_size) * 100).toFixed(2)) : 0;
    latestByCohort.set(row.cohort_day, {
      cohort: shortDay(row.cohort_day),
      retentionRatePercent: rate,
    });
  }
  return [...latestByCohort.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);
}

function shortDay(value: string) {
  return value.slice(0, 10);
}

function lastItem<T>(items: T[]): T | undefined {
  return items.length ? items[items.length - 1] : undefined;
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
