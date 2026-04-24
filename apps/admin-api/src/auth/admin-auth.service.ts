import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@uprm/db';
import jwt, { type Algorithm, JwtPayload } from 'jsonwebtoken';
import {
  ADMIN_ROLES,
  type AdminRole,
  type AuthenticatedAdmin,
} from './admin-auth.types';

@Injectable()
export class AdminAuthService {
  private readonly db = prisma;

  constructor(private readonly config: ConfigService) {}

  async authenticateAuthorizationHeader(
    authorizationHeader: string | string[] | undefined,
  ): Promise<AuthenticatedAdmin> {
    const raw = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;
    const token = raw?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('missing bearer token');
    }

    const payload = this.verifyJwt(token);
    const subject = payload.sub?.trim();
    if (!subject) {
      throw new UnauthorizedException('token subject missing');
    }

    const adminUser = await this.db.adminUser.findUnique({
      where: { subject },
    });
    if (!adminUser || adminUser.status !== 'active') {
      throw new UnauthorizedException('admin user is not authorized');
    }

    return {
      adminUserId: adminUser.id,
      subject,
      email: adminUser.email ?? readStringClaim(payload, 'email'),
      displayName:
        adminUser.displayName ??
        readStringClaim(payload, 'name') ??
        readStringClaim(payload, 'preferred_username'),
      roles: adminUser.roles.filter(isAdminRole),
    };
  }

  async upsertAdminUser(input: {
    subject: string;
    email?: string | null;
    displayName?: string | null;
    roles: AdminRole[];
  }) {
    return this.db.adminUser.upsert({
      where: { subject: input.subject },
      update: {
        email: input.email ?? null,
        displayName: input.displayName ?? null,
        roles: input.roles,
        status: 'active',
      },
      create: {
        subject: input.subject,
        email: input.email ?? null,
        displayName: input.displayName ?? null,
        roles: input.roles,
      },
    });
  }

  private verifyJwt(token: string): JwtPayload {
    const issuer = this.config.get<string>('UPRM_ADMIN_JWT_ISSUER');
    const audience = this.config.get<string>('UPRM_ADMIN_JWT_AUDIENCE');
    const sharedSecret = this.config.get<string>('UPRM_ADMIN_JWT_SECRET');
    const publicKey = this.config.get<string>('UPRM_ADMIN_JWT_PUBLIC_KEY');

    const key = sharedSecret || publicKey;
    if (!key) {
      throw new UnauthorizedException('admin JWT validation is not configured');
    }

    const algorithms: Algorithm[] = sharedSecret
      ? ['HS256', 'HS384', 'HS512']
      : ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'];

    try {
      const verified = jwt.verify(token, key, {
        issuer: issuer || undefined,
        audience: audience || undefined,
        algorithms,
      });
      if (typeof verified === 'string') {
        throw new UnauthorizedException('invalid bearer token');
      }
      return verified;
    } catch {
      throw new UnauthorizedException('invalid bearer token');
    }
  }
}

function readStringClaim(payload: JwtPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}
