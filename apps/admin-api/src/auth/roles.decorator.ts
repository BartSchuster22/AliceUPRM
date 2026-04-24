import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from './admin-auth.types';

export const ROLES_KEY = 'admin_roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
