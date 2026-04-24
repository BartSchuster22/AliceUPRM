import { Injectable } from '@nestjs/common';
import { prisma } from '@uprm/db';
import type {
  AuthenticatedAdmin,
  AdminRequestLike,
} from '../auth/admin-auth.types';

@Injectable()
export class AuditService {
  private readonly db = prisma;

  async write(input: {
    actor: AuthenticatedAdmin;
    request: AdminRequestLike;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    tenantId?: string | null;
    before?: unknown;
    after?: unknown;
  }) {
    return this.db.auditLog.create({
      data: {
        actorAdminUserId: input.actor.adminUserId,
        actorSubject: input.actor.subject,
        actorEmail: input.actor.email,
        actorRoles: input.actor.roles,
        tenantId: input.tenantId ?? null,
        route:
          input.request.route?.path ??
          input.request.originalUrl ??
          input.request.url ??
          'unknown',
        method: input.request.method ?? 'UNKNOWN',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        beforeJson: serializeJson(input.before),
        afterJson: serializeJson(input.after),
      },
    });
  }
}

function serializeJson(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
    ),
  );
}
