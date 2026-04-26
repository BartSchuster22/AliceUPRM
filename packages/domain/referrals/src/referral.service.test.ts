import { describe, it, expect, vi } from 'vitest';
import { ReferralService, ReferralError } from './referral.service';

function makeFakeDb() {
  const state: any = {
    codes: new Map<string, any>(),
    edges: new Map<string, any>(),
    ancestry: new Map<string, any>(),
    tenantUsers: new Map<string, any>(),
  };

  const db: any = {
    referralCode: {
      create: vi.fn(async ({ data }: any) => {
        const k = `${data.tenantId}:${data.code}`;
        if (state.codes.has(k)) {
          const err: any = new Error('unique violation');
          err.code = 'P2002';
          throw err;
        }
        const row = { id: `code_${state.codes.size + 1}`, status: 'active', ...data };
        state.codes.set(k, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return (
          state.codes.get(`${where.tenantId_code.tenantId}:${where.tenantId_code.code}`) ?? null
        );
      }),
    },
    referralEdge: {
      findUnique: vi.fn(async ({ where }: any) => {
        const k = `${where.tenantId_referredTenantUserId.tenantId}:${where.tenantId_referredTenantUserId.referredTenantUserId}`;
        return state.edges.get(k) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `edge_${state.edges.size + 1}`,
          lockedAt: null,
          createdAt: new Date(),
          ...data,
        };
        state.edges.set(`${data.tenantId}:${data.referredTenantUserId}`, row);
        return row;
      }),
      delete: vi.fn(async ({ where }: any) => {
        for (const [k, v] of state.edges) {
          if (v.id === where.id) state.edges.delete(k);
        }
        return { id: where.id };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const k = `${where.tenantId_referredTenantUserId.tenantId}:${where.tenantId_referredTenantUserId.referredTenantUserId}`;
        const row = state.edges.get(k);
        if (!row) return null;
        Object.assign(row, data);
        return row;
      }),
    },
    referralAncestry: {
      findMany: vi.fn(async ({ where }: any) => {
        const rows: any[] = [];
        for (const [, r] of state.ancestry) {
          if (r.tenantId !== where.tenantId) continue;
          if (
            where.descendantTenantUserId &&
            r.descendantTenantUserId !== where.descendantTenantUserId
          )
            continue;
          if (where.ancestorTenantUserId && r.ancestorTenantUserId !== where.ancestorTenantUserId)
            continue;
          if (where.depth?.gt !== undefined && r.depth <= where.depth.gt) continue;
          if (where.depth?.lte !== undefined && r.depth > where.depth.lte) continue;
          rows.push(r);
        }
        return rows;
      }),
      createMany: vi.fn(async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const row of data) {
          const k = `${row.tenantId}:${row.descendantTenantUserId}:${row.ancestorTenantUserId}`;
          if (state.ancestry.has(k) && skipDuplicates) continue;
          state.ancestry.set(k, { ...row, createdAt: new Date() });
          count++;
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [k, r] of state.ancestry) {
          if (r.tenantId !== where.tenantId) continue;
          if (r.descendantTenantUserId !== where.descendantTenantUserId) continue;
          state.ancestry.delete(k);
          count++;
        }
        return { count };
      }),
    },
    tenantUser: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where?.id) {
          return state.tenantUsers.get(where.id) ?? null;
        }
        return null;
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(db)),
  };

  return { db, state };
}

describe('ReferralService.createCode', () => {
  it('creates a unique code', async () => {
    const { db } = makeFakeDb();
    const svc = new ReferralService(db);
    const code = await svc.createCode({ tenantId: 't1', tenantUserId: 'u1' });
    expect(code.code).toMatch(/^[A-Z2-9]{10}$/);
    expect(code.status).toBe('active');
  });
});

describe('ReferralService.applyCode - basic edge', () => {
  it('creates an edge and ancestry rows for a simple A->B', async () => {
    const { db, state } = makeFakeDb();
    const svc = new ReferralService(db);
    const codeA = await svc.createCode({ tenantId: 't1', tenantUserId: 'A' });
    const edge = await svc.applyCode({
      tenantId: 't1',
      referredTenantUserId: 'B',
      code: codeA.code,
    });
    expect(edge.referrerTenantUserId).toBe('A');
    expect(edge.referredTenantUserId).toBe('B');
    const rows = Array.from(state.ancestry.values());
    const byDepth = new Map(rows.map((r: any) => [r.ancestorTenantUserId, r.depth]));
    expect(byDepth.get('B')).toBe(0);
    expect(byDepth.get('A')).toBe(1);
  });
});

describe('ReferralService.applyCode - chain propagation', () => {
  it('A->B then B->C gives C two ancestors', async () => {
    const { db, state } = makeFakeDb();
    const svc = new ReferralService(db);
    const codeA = await svc.createCode({ tenantId: 't1', tenantUserId: 'A' });
    await svc.applyCode({ tenantId: 't1', referredTenantUserId: 'B', code: codeA.code });
    const codeB = await svc.createCode({ tenantId: 't1', tenantUserId: 'B' });
    await svc.applyCode({ tenantId: 't1', referredTenantUserId: 'C', code: codeB.code });
    const ancestorsOfC = Array.from(state.ancestry.values())
      .filter((r: any) => r.descendantTenantUserId === 'C')
      .sort((a: any, b: any) => a.depth - b.depth);
    expect(ancestorsOfC.map((r: any) => [r.ancestorTenantUserId, r.depth])).toEqual([
      ['C', 0],
      ['B', 1],
      ['A', 2],
    ]);
  });

  it('rejects self-referral', async () => {
    const { db } = makeFakeDb();
    const svc = new ReferralService(db);
    const code = await svc.createCode({ tenantId: 't1', tenantUserId: 'A' });
    await expect(
      svc.applyCode({ tenantId: 't1', referredTenantUserId: 'A', code: code.code }),
    ).rejects.toMatchObject({ code: 'SELF_REFERRAL' });
  });
});

describe('ReferralService.applyCode - guards', () => {
  it('rejects a cycle: A->B->C, then C tries to refer A', async () => {
    const { db } = makeFakeDb();
    const svc = new ReferralService(db);
    const codeA = await svc.createCode({ tenantId: 't1', tenantUserId: 'A' });
    await svc.applyCode({ tenantId: 't1', referredTenantUserId: 'B', code: codeA.code });
    const codeB = await svc.createCode({ tenantId: 't1', tenantUserId: 'B' });
    await svc.applyCode({ tenantId: 't1', referredTenantUserId: 'C', code: codeB.code });
    const codeC = await svc.createCode({ tenantId: 't1', tenantUserId: 'C' });
    await expect(
      svc.applyCode({ tenantId: 't1', referredTenantUserId: 'A', code: codeC.code }),
    ).rejects.toMatchObject({ code: 'CYCLE' });
  });

  it('is idempotent: same code applied twice returns the same edge', async () => {
    const { db } = makeFakeDb();
    const svc = new ReferralService(db);
    const code = await svc.createCode({ tenantId: 't1', tenantUserId: 'A' });
    const first = await svc.applyCode({
      tenantId: 't1',
      referredTenantUserId: 'B',
      code: code.code,
    });
    const second = await svc.applyCode({
      tenantId: 't1',
      referredTenantUserId: 'B',
      code: code.code,
    });
    expect(second.id).toBe(first.id);
  });

  it('rejects reassignment after edge is locked', async () => {
    const { db } = makeFakeDb();
    const svc = new ReferralService(db);
    const codeA = await svc.createCode({ tenantId: 't1', tenantUserId: 'A' });
    await svc.applyCode({ tenantId: 't1', referredTenantUserId: 'B', code: codeA.code });
    await svc.lockEdge('t1', 'B');
    const codeX = await svc.createCode({ tenantId: 't1', tenantUserId: 'X' });
    await expect(
      svc.applyCode({ tenantId: 't1', referredTenantUserId: 'B', code: codeX.code }),
    ).rejects.toMatchObject({ code: 'LOCKED' });
  });
});

describe('ReferralService.getEffectiveReferralChain', () => {
  it('falls back to source provenance when there is no explicit referral edge', async () => {
    const { db, state } = makeFakeDb();
    const svc = new ReferralService(db);

    state.tenantUsers.set('tenant-user-root', {
      id: 'tenant-user-root',
      tenantId: 'uprm',
      sourceTenantUserId: null,
    });
    state.tenantUsers.set('tenant-user-psi', {
      id: 'tenant-user-psi',
      tenantId: 'psi',
      sourceTenantUserId: 'tenant-user-root',
    });
    state.tenantUsers.set('tenant-user-alice', {
      id: 'tenant-user-alice',
      tenantId: 'psi',
      sourceTenantUserId: 'tenant-user-psi',
    });

    await expect(svc.getEffectiveReferralChain('psi', 'tenant-user-alice', 3)).resolves.toEqual([
      expect.objectContaining({
        ancestorTenantUserId: 'tenant-user-psi',
        ancestorTenantId: 'psi',
        descendantTenantUserId: 'tenant-user-alice',
        depth: 1,
        relationType: 'source_provenance',
      }),
      expect.objectContaining({
        ancestorTenantUserId: 'tenant-user-root',
        ancestorTenantId: 'uprm',
        descendantTenantUserId: 'tenant-user-alice',
        depth: 2,
        relationType: 'source_provenance',
      }),
    ]);
  });

  it('extends explicit tenant referral ancestry with source provenance above the last explicit ancestor', async () => {
    const { db, state } = makeFakeDb();
    const svc = new ReferralService(db);

    state.tenantUsers.set('tenant-user-root', {
      id: 'tenant-user-root',
      tenantId: 'uprm',
      sourceTenantUserId: null,
    });
    state.tenantUsers.set('tenant-user-psi', {
      id: 'tenant-user-psi',
      tenantId: 'psi',
      sourceTenantUserId: 'tenant-user-root',
    });
    state.tenantUsers.set('tenant-user-alice', {
      id: 'tenant-user-alice',
      tenantId: 'psi',
      sourceTenantUserId: 'tenant-user-psi',
    });
    state.tenantUsers.set('tenant-user-bob', {
      id: 'tenant-user-bob',
      tenantId: 'psi',
      sourceTenantUserId: 'tenant-user-alice',
    });

    state.ancestry.set('psi:tenant-user-bob:tenant-user-bob', {
      tenantId: 'psi',
      ancestorTenantUserId: 'tenant-user-bob',
      descendantTenantUserId: 'tenant-user-bob',
      depth: 0,
      createdAt: new Date(),
    });
    state.ancestry.set('psi:tenant-user-bob:tenant-user-alice', {
      tenantId: 'psi',
      ancestorTenantUserId: 'tenant-user-alice',
      descendantTenantUserId: 'tenant-user-bob',
      depth: 1,
      createdAt: new Date(),
    });

    await expect(svc.getEffectiveReferralChain('psi', 'tenant-user-bob', 3)).resolves.toEqual([
      expect.objectContaining({
        ancestorTenantUserId: 'tenant-user-alice',
        ancestorTenantId: 'psi',
        descendantTenantUserId: 'tenant-user-bob',
        depth: 1,
        relationType: 'referral_edge',
      }),
      expect.objectContaining({
        ancestorTenantUserId: 'tenant-user-psi',
        ancestorTenantId: 'psi',
        descendantTenantUserId: 'tenant-user-bob',
        depth: 2,
        relationType: 'source_provenance',
      }),
      expect.objectContaining({
        ancestorTenantUserId: 'tenant-user-root',
        ancestorTenantId: 'uprm',
        descendantTenantUserId: 'tenant-user-bob',
        depth: 3,
        relationType: 'source_provenance',
      }),
    ]);
  });
});
