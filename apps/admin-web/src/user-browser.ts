import type { TenantRecord, TenantUserSummary } from './api';

export interface UserListRow extends TenantUserSummary {
  tenant_name: string | null;
  tenant_slug: string | null;
}

export function combineUserRows(
  tenants: TenantRecord[],
  perTenantResults: Array<{ tenantId: string; users: TenantUserSummary[] }>,
): UserListRow[] {
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  return perTenantResults
    .flatMap(({ users }) => users)
    .map((user) => ({
      ...user,
      tenant_name: tenantById.get(user.tenant_id)?.name ?? null,
      tenant_slug: tenantById.get(user.tenant_id)?.slug ?? null,
    }))
    .sort((a, b) => {
      if (a.tenant_status !== b.tenant_status) {
        return a.tenant_status === 'active' ? -1 : 1;
      }
      return `${a.username ?? a.email ?? a.external_user_id}`.localeCompare(
        `${b.username ?? b.email ?? b.external_user_id}`,
      );
    });
}
