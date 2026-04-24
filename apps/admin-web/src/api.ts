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

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await safeRead(response);
    throw new Error(body || `Login failed (${response.status})`);
  }

  return (await response.json()) as LoginResponse;
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
