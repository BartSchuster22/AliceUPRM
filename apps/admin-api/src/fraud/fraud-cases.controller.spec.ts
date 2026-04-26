import { NotFoundException } from '@nestjs/common';
import { FraudCasesController } from './fraud-cases.controller';

describe('FraudCasesController', () => {
  let controller: FraudCasesController;

  beforeEach(() => {
    controller = new FraudCasesController();
    (controller as any).db = {
      tenantUser: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            username: 'alice',
            externalUserId: 'alice-ext',
            user: { emailNormalized: 'alice@example.com' },
            tenant: { name: 'PSI', slug: 'psi' },
          },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          username: 'alice',
          externalUserId: 'alice-ext',
          user: { emailNormalized: 'alice@example.com' },
          tenant: { name: 'PSI', slug: 'psi' },
        }),
      },
    };
  });

  it('lists fraud cases with normalized enriched fields', async () => {
    (controller as any).fraud = {
      listCases: jest.fn().mockResolvedValue([
        {
          id: 'case-1',
          tenantId: 'tenant-1',
          tenantUserId: 'user-1',
          status: 'open',
          severity: 'high',
          scoreTotal: 120,
          holdCount: 2,
          resolution: null,
          resolutionNote: null,
          openedBySignalId: 'sig-1',
          openedAt: new Date('2026-04-24T19:00:00.000Z'),
          resolvedAt: null,
          thresholdSnapshot: { caseThreshold: 100 },
        },
      ]),
    };

    const result = await controller.list({
      tenantId: 'tenant-1',
      status: 'open',
      severity: 'high',
    });

    expect((controller as any).fraud.listCases).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: 'open',
      severity: 'high',
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'case-1',
        tenant_id: 'tenant-1',
        tenant_user_id: 'user-1',
        tenant_name: 'PSI',
        tenant_slug: 'psi',
        user_label: 'alice',
        user_email: 'alice@example.com',
        status: 'open',
        severity: 'high',
        score_total: 120,
        hold_count: 2,
      }),
    );
  });

  it('returns detail payload with signals, holds, events, and enriched labels', async () => {
    (controller as any).fraud = {
      getCase: jest.fn().mockResolvedValue({
        id: 'case-1',
        tenantId: 'tenant-1',
        tenantUserId: 'user-1',
        status: 'open',
        severity: 'high',
        scoreTotal: 120,
        holdCount: 1,
        resolution: null,
        resolutionNote: null,
        openedBySignalId: 'sig-1',
        openedAt: new Date('2026-04-24T19:00:00.000Z'),
        resolvedAt: null,
        thresholdSnapshot: { caseThreshold: 100 },
        openedBySignal: {
          id: 'sig-1',
          signalType: 'same_ip_multiple_signups',
          score: 35,
          severity: 'low',
          metadata: { ip: '1.2.3.4' },
          createdAt: new Date('2026-04-24T18:59:00.000Z'),
        },
        rewardHolds: [
          {
            id: 'hold-1',
            scheduledPostingId: 'sp-1',
            status: 'active',
            reasonCode: 'fraud_case_opened',
            createdAt: new Date('2026-04-24T19:00:00.000Z'),
            releasedAt: null,
            rejectedAt: null,
          },
        ],
        relatedSignals: [
          {
            id: 'sig-1',
            signalType: 'same_ip_multiple_signups',
            score: 35,
            severity: 'low',
            metadata: { ip: '1.2.3.4' },
            createdAt: new Date('2026-04-24T18:59:00.000Z'),
          },
        ],
        events: [
          {
            id: 'event-1',
            actorType: 'system',
            actorId: null,
            action: 'open',
            beforeJson: null,
            afterJson: { status: 'open' },
            createdAt: new Date('2026-04-24T19:00:00.000Z'),
          },
        ],
      }),
    };

    const result = await controller.detail('case-1');
    expect(result.user_label).toBe('alice');
    expect(result.tenant_name).toBe('PSI');
    expect(result.related_signals).toHaveLength(1);
    expect(result.reward_holds).toHaveLength(1);
    expect(result.events).toHaveLength(1);
  });

  it('resolves a case and writes an audit row', async () => {
    (controller as any).fraud = {
      getCase: jest
        .fn()
        .mockResolvedValueOnce({ id: 'case-1', tenantId: 'tenant-1' })
        .mockResolvedValueOnce({
          id: 'case-1',
          tenantId: 'tenant-1',
          tenantUserId: 'user-1',
          status: 'allowed',
          severity: 'high',
          scoreTotal: 120,
          holdCount: 0,
          resolution: 'allow',
          resolutionNote: 'ok',
          openedBySignalId: 'sig-1',
          openedAt: new Date('2026-04-24T19:00:00.000Z'),
          resolvedAt: new Date('2026-04-24T19:05:00.000Z'),
          thresholdSnapshot: { caseThreshold: 100 },
          openedBySignal: null,
          rewardHolds: [],
          relatedSignals: [],
          events: [],
        }),
      allowCase: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }),
      rejectCase: jest.fn(),
      escalateCase: jest.fn(),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const result = await controller.allow(
      'case-1',
      { note: 'ok' },
      {
        admin: {
          adminUserId: 'admin-1',
          subject: 'local:admin@uprm.local',
          email: 'admin@uprm.local',
          displayName: 'Admin',
          roles: ['fraud_reviewer'],
        },
        method: 'POST',
        route: { path: '/admin/fraud-cases/:id/allow' },
        headers: {},
      },
    );

    expect((controller as any).fraud.allowCase).toHaveBeenCalledWith(
      'case-1',
      { actorType: 'admin', actorId: 'admin-1' },
      'ok',
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result.status).toBe('allowed');
  });

  it('throws NotFoundException when case is missing', async () => {
    (controller as any).fraud = {
      getCase: jest.fn().mockResolvedValue(null),
    };

    await expect(controller.detail('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
