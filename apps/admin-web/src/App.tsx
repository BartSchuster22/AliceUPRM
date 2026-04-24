import { useEffect, useMemo, useState } from 'react';
import { fetchTenants, login, type TenantRecord } from './api';

type ViewKey = 'tenants' | 'users' | 'wallets' | 'promoters' | 'fraud' | 'settlements';

const NAV_ITEMS: Array<{ key: ViewKey; label: string }> = [
  { key: 'tenants', label: 'Tenants' },
  { key: 'users', label: 'Users' },
  { key: 'wallets', label: 'Wallets' },
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

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null,
    [selectedTenantId, tenants],
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
      if (message.includes('401')) {
        logout();
      }
    } finally {
      setLoading(false);
    }
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
    setSelectedTenantId('');
    setIsAuthenticated(false);
    setStatus('Signed out.');
    navigate(LOGIN_PATH);
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
                if (event.key === 'Enter' && !loading) {
                  void submitLogin();
                }
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

        {view === 'tenants' ? (
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
              <h3>Selected tenant</h3>
              {selectedTenant ? (
                <>
                  <dl className="detail-list">
                    <div>
                      <dt>ID</dt>
                      <dd>{selectedTenant.id}</dd>
                    </div>
                    <div>
                      <dt>Name</dt>
                      <dd>{selectedTenant.name}</dd>
                    </div>
                    <div>
                      <dt>Slug</dt>
                      <dd>{selectedTenant.slug}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedTenant.status}</dd>
                    </div>
                    <div>
                      <dt>Base currency</dt>
                      <dd>{selectedTenant.baseCurrency}</dd>
                    </div>
                  </dl>
                  <h4>Config JSON</h4>
                  <pre>{JSON.stringify(selectedTenant.config ?? {}, null, 2)}</pre>
                </>
              ) : (
                <p className="muted">No tenant selected.</p>
              )}
            </section>
          </section>
        ) : (
          <section className="panel">
            <h3>{NAV_ITEMS.find((item) => item.key === view)?.label}</h3>
            <p>
              This Phase 8 screen shell is in place. The next backend/API slices will fill this page
              with live UPRM data and mutations.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
