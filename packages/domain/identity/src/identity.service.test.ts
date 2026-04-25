import { describe, it, expect } from 'vitest';
import { normaliseEmail, IdentityError, IdentityService } from './identity.service';

describe('normaliseEmail', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Foo@Bar.com  ')).toBe('foo@bar.com');
  });

  it('strips +subaddress', () => {
    expect(normaliseEmail('alice+shop@example.com')).toBe('alice@example.com');
  });

  it('strips dots from gmail.com local-part', () => {
    expect(normaliseEmail('a.l.i.c.e@gmail.com')).toBe('alice@gmail.com');
  });

  it('strips dots from googlemail.com too', () => {
    expect(normaliseEmail('bob.smith@googlemail.com')).toBe('bobsmith@googlemail.com');
  });

  it('leaves non-gmail dots alone', () => {
    expect(normaliseEmail('a.b@yahoo.com')).toBe('a.b@yahoo.com');
  });

  it('rejects missing @', () => {
    expect(() => normaliseEmail('no-at-sign')).toThrow(IdentityError);
  });
});

describe('IdentityService provenance enforcement', () => {
  it('rejects non-system users without a source tenant user', async () => {
    const svc = new IdentityService({
      tenantUser: {
        findUnique: async () => null,
      },
    } as any);

    await expect(
      svc.findOrCreateTenantUser({
        tenantId: 'tenant-1',
        email: 'alice@example.com',
        externalUserId: 'alice',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_REQUIRED' });
  });

  it('rejects mismatched source tenant and source user tenant', async () => {
    const svc = new IdentityService({
      tenantUser: {
        findUnique: async () => null,
        findFirst: async () => ({
          id: 'source-1',
          tenantId: 'tenant-a',
          user: { emailNormalized: 'src@example.com' },
        }),
      },
    } as any);

    await expect(
      svc.findOrCreateTenantUser({
        tenantId: 'tenant-b',
        email: 'alice@example.com',
        externalUserId: 'alice',
        sourceTenantId: 'tenant-b',
        sourceTenantUserId: 'source-1',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });

  it('infers source tenant from the source user tenant', async () => {
    const createdRows: any[] = [];
    const svc = new IdentityService({
      tenantUser: {
        findUnique: async () => null,
        findFirst: async () => ({
          id: 'source-1',
          tenantId: 'tenant-a',
          user: { emailNormalized: 'src@example.com' },
        }),
      },
      user: {
        upsert: async () => ({ id: 'user-1' }),
      },
      $transaction: async (fn: any) =>
        fn({
          user: {
            upsert: async () => ({ id: 'user-1' }),
          },
          tenantUser: {
            create: async ({ data }: any) => {
              createdRows.push(data);
              return {
                id: 'tu-1',
                ...data,
                user: { id: 'user-1', emailNormalized: 'alice@example.com' },
              };
            },
          },
        }),
    } as any);

    const created = await svc.findOrCreateTenantUser({
      tenantId: 'tenant-b',
      email: 'alice@example.com',
      externalUserId: 'alice',
      sourceTenantUserId: 'source-1',
    });

    expect(created.sourceTenantId).toBe('tenant-a');
    expect(created.sourceTenantUserId).toBe('source-1');
    expect(createdRows[0].sourceTenantId).toBe('tenant-a');
  });
});
