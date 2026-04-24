import { NotFoundException } from '@nestjs/common';
import { WebhookDeliveriesController } from './webhook-deliveries.controller';

describe('WebhookDeliveriesController', () => {
  let controller: WebhookDeliveriesController;

  beforeEach(() => {
    controller = new WebhookDeliveriesController();
  });

  it('lists webhook deliveries with normalized field names', async () => {
    (controller as any).deliveries = {
      listDeliveries: jest.fn().mockResolvedValue([
        {
          id: 'wd-1',
          tenantId: 'tenant-1',
          eventType: 'reward.created',
          endpointUrl: 'https://psi.internal/uprm/webhooks',
          status: 'retrying',
          attemptCount: 2,
          nextAttemptAt: new Date('2026-04-24T18:30:00.000Z'),
          lastAttemptAt: new Date('2026-04-24T18:20:00.000Z'),
          deliveredAt: null,
          lastStatusCode: 500,
          lastError: 'server error',
          sourceTopic: 'uprm.domain.reward.created',
          sourceEventId: 'evt-1',
          createdAt: new Date('2026-04-24T18:00:00.000Z'),
          updatedAt: new Date('2026-04-24T18:20:00.000Z'),
        },
      ]),
    };

    const result = await controller.list({
      tenantId: 'tenant-1',
      status: 'retrying',
      eventType: 'reward.created',
    });

    expect((controller as any).deliveries.listDeliveries).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: 'retrying',
      eventType: 'reward.created',
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'wd-1',
        tenant_id: 'tenant-1',
        event_type: 'reward.created',
        endpoint_url: 'https://psi.internal/uprm/webhooks',
        status: 'retrying',
      }),
    );
  });

  it('replays a delivery and writes an audit row', async () => {
    (controller as any).deliveries = {
      replayDelivery: jest.fn().mockResolvedValue({
        id: 'wd-2',
        tenantId: 'tenant-1',
        eventType: 'reward.created',
        endpointUrl: 'https://psi.internal/uprm/webhooks',
        status: 'pending',
      }),
    };
    (controller as any).audit = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const result = await controller.replay('wd-1', {
      admin: {
        adminUserId: 'admin-1',
        subject: 'local:admin@uprm.local',
        email: 'admin@uprm.local',
        displayName: 'Admin',
        roles: ['super_admin'],
      },
      method: 'POST',
      route: { path: '/admin/webhook-deliveries/:id/replay' },
      headers: {},
    });

    expect((controller as any).deliveries.replayDelivery).toHaveBeenCalledWith(
      'wd-1',
    );
    expect((controller as any).audit.write).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'wd-2',
      status: 'pending',
      tenant_id: 'tenant-1',
      event_type: 'reward.created',
      endpoint_url: 'https://psi.internal/uprm/webhooks',
    });
  });

  it('returns NotFoundException when replay target does not exist', async () => {
    (controller as any).deliveries = {
      replayDelivery: jest
        .fn()
        .mockRejectedValue(new Error('webhook delivery not found')),
    };

    await expect(
      controller.replay('wd-missing', {
        headers: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
