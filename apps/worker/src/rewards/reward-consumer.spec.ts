import type { ScheduledPostingService } from '@uprm/rewards';
import { RewardConsumer } from './reward-consumer';

describe('RewardConsumer compensating events', () => {
  it('routes refund events to compensating-event handling instead of reward scheduling', async () => {
    const compensateForLinkedEvent = jest.fn().mockResolvedValue({
      linked: true,
      cancelled: 1,
      reversed: 0,
      skipped: 0,
    });
    const scheduler = {
      compensateForLinkedEvent,
      scheduleRewards: jest.fn(),
    } as unknown as Pick<
      ScheduledPostingService,
      'compensateForLinkedEvent' | 'scheduleRewards'
    >;
    const consumer = new RewardConsumer('amqp://example', { scheduler });

    await consumer['processEvent']({
      eventId: 'refund-evt-1',
      tenantId: 'tenant-1',
      eventType: 'refund_issued',
      externalUserId: 'user-1',
      amount: '29.99',
      currency: 'EUR',
    });

    expect(compensateForLinkedEvent).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      compensatingEventId: 'refund-evt-1',
      compensatingEventType: 'refund_issued',
    });
  });
});
