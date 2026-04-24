import { useEffect, useMemo, useState } from 'react';
import { fetchTenants, type TenantRecord } from './api';

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
  const [tokenInput, setTokenInput] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Paste an admin bearer token to load the backoffice.');
  const [view, setView] = useState<ViewKey>('tenants');
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
    if (stored) {
      setToken(stored);
      setTokenInput(stored);
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
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load tenants.');
      setTenants([]);
      setSelectedTenantId('');
    } finally {
      setLoading(false);
    }
  }

  function connectToken() {
    const cleaned = tokenInput.trim();
    setToken(cleaned);
    if (cleaned) {
      window.localStorage.setItem(TOKEN_KEY, cleaned);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
    }
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
          <span>Bearer token</span>
          <textarea
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Paste a JWT issued by your admin identity provider"
            rows={5}
          />
        </label>

        <button className="primary" onClick={connectToken}>
          Save token
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
