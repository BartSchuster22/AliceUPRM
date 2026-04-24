import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
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

    return this.toAuthenticatedAdmin(adminUser, payload);
  }

  async authenticateWithPassword(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const adminUser = await this.db.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (
      !adminUser ||
      adminUser.status !== 'active' ||
      !adminUser.passwordHash ||
      !this.verifyPassword(password, adminUser.passwordHash)
    ) {
      throw new UnauthorizedException('invalid email or password');
    }

    await this.db.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLoginAt: new Date() },
    });

    const admin = this.toAuthenticatedAdmin(adminUser, null);
    return {
      token: this.issueJwt(admin),
      admin,
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
        email: input.email?.trim().toLowerCase() ?? null,
        displayName: input.displayName ?? null,
        roles: input.roles,
        status: 'active',
      },
      create: {
        subject: input.subject,
        email: input.email?.trim().toLowerCase() ?? null,
        displayName: input.displayName ?? null,
        roles: input.roles,
      },
    });
  }

  async upsertLocalAdminUser(input: {
    email: string;
    displayName?: string | null;
    password: string;
    roles: AdminRole[];
  }) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const subject = `local:${normalizedEmail}`;
    const passwordHash = this.hashPassword(input.password);

    return this.db.adminUser.upsert({
      where: { subject },
      update: {
        email: normalizedEmail,
        displayName: input.displayName ?? null,
        passwordHash,
        roles: input.roles,
        status: 'active',
      },
      create: {
        subject,
        email: normalizedEmail,
        displayName: input.displayName ?? null,
        passwordHash,
        roles: input.roles,
        status: 'active',
      },
    });
  }

  issueJwt(admin: AuthenticatedAdmin) {
    const sharedSecret = this.config.get<string>('UPRM_ADMIN_JWT_SECRET');
    const issuer = this.config.get<string>('UPRM_ADMIN_JWT_ISSUER');
    const audience = this.config.get<string>('UPRM_ADMIN_JWT_AUDIENCE');
    if (!sharedSecret) {
      throw new UnauthorizedException(
        'admin JWT signing secret is not configured',
      );
    }

    const options: jwt.SignOptions = {
      algorithm: 'HS256',
      subject: admin.subject,
      expiresIn: '12h',
    };
    if (issuer) options.issuer = issuer;
    if (audience) options.audience = audience;

    return jwt.sign(
      {
        email: admin.email,
        name: admin.displayName,
        roles: admin.roles,
      },
      sharedSecret,
      options,
    );
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

  private toAuthenticatedAdmin(
    adminUser: any,
    payload: JwtPayload | null,
  ): AuthenticatedAdmin {
    return {
      adminUserId: adminUser.id,
      subject: adminUser.subject,
      email: adminUser.email ?? readStringClaim(payload, 'email'),
      displayName:
        adminUser.displayName ??
        readStringClaim(payload, 'name') ??
        readStringClaim(payload, 'preferred_username'),
      roles: adminUser.roles.filter(isAdminRole),
    };
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  private verifyPassword(password: string, encoded: string) {
    const parts = encoded.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    const salt = parts[1]!;
    const expectedHex = parts[2]!;
    const actual = Buffer.from(
      scryptSync(password, salt, 64).toString('hex'),
      'hex',
    );
    const expected = Buffer.from(expectedHex, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}

function readStringClaim(
  payload: JwtPayload | null,
  key: string,
): string | null {
  if (!payload) return null;
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}
