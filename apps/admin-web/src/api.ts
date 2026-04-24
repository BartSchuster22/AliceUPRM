export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  baseCurrency: string;
  config?: Record<string, unknown>;
}

export async function fetchTenants(token: string): Promise<TenantRecord[]> {
  const response = await fetch('/admin/tenants', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await safeRead(response);
    throw new Error(body || `Failed to load tenants (${response.status})`);
  }

  return (await response.json()) as TenantRecord[];
}

async function safeRead(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
