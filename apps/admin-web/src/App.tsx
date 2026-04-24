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

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Sign in to access the UPRM admin dashboard.');
  const [view, setView] = useState<ViewKey>('tenants');
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
    if (stored) {
      setToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadTenants(token);
  }, [token]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null,
    [selectedTenantId, tenants],
  );

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
      setStatus(error instanceof Error ? error.message : 'Failed to load tenants.');
      setTenants([]);
      setSelectedTenantId('');
      if (String(error).includes('401')) {
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
          />
        </label>

        <button className="primary" onClick={() => void submitLogin()} disabled={loading}>
          Sign in
        </button>

        <button className="secondary" onClick={logout} disabled={!isAuthenticated}>
          Sign out
        </button>

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
              disabled={!isAuthenticated}
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

        {!isAuthenticated ? (
          <section className="panel">
            <h3>Login required</h3>
            <p>Use your local admin email and password to enter the dashboard.</p>
          </section>
        ) : view === 'tenants' ? (
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
