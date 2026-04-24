export const ADMIN_ROLES = [
  'super_admin',
  'tenant_admin',
  'fraud_reviewer',
  'support',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AuthenticatedAdmin {
  adminUserId: string;
  subject: string;
  email: string | null;
  displayName: string | null;
  roles: AdminRole[];
}

export interface AdminRequestLike {
  headers: Record<string, string | string[] | undefined>;
  admin?: AuthenticatedAdmin;
  method?: string;
  route?: { path?: string };
  originalUrl?: string;
  url?: string;
}
