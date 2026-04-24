import { WebhookDispatcher } from './webhook-dispatcher';

describe('WebhookDispatcher', () => {
  it('marks successful deliveries as delivered', async () => {
    const service: any = {
      claimDueBatch: jest.fn().mockResolvedValue([
        {
          id: 'wd-1',
          endpointUrl: 'https://psi.internal/uprm/webhooks',
          signingSecret: 'supersecret1',
          payload: { eventType: 'reward.created' },
          attemptCount: 0,
          createdAt: new Date('2026-04-24T18:00:00.000Z'),
        },
      ]),
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markFailure: jest.fn().mockResolvedValue(undefined),
    };
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok'),
    });

    const dispatcher = new WebhookDispatcher(fetchImpl as any, service);
    const delivered = await dispatcher.dispatchBatch(
      new Date('2026-04-24T18:05:00.000Z'),
    );

    expect(delivered).toBe(1);
    expect(service.markDelivered).toHaveBeenCalledWith('wd-1', 200);
    expect(service.markFailure).not.toHaveBeenCalled();
  });

  it('retries failed deliveries with backoff before dead-letter threshold', async () => {
    const service: any = {
      claimDueBatch: jest.fn().mockResolvedValue([
        {
          id: 'wd-2',
          endpointUrl: 'https://psi.internal/uprm/webhooks',
          signingSecret: 'supersecret1',
          payload: { eventType: 'reward.created' },
          attemptCount: 1,
          createdAt: new Date('2026-04-24T18:00:00.000Z'),
        },
      ]),
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markFailure: jest.fn().mockResolvedValue(undefined),
    };
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('server error'),
    });

    const now = new Date('2026-04-24T18:05:00.000Z');
    const dispatcher = new WebhookDispatcher(fetchImpl as any, service);
    await dispatcher.dispatchBatch(now);

    expect(service.markFailure).toHaveBeenCalledTimes(1);
    expect(service.markFailure.mock.calls[0][1].deadLetter).toBe(false);
  });

  it('dead-letters after the threshold is reached', async () => {
    const service: any = {
      claimDueBatch: jest.fn().mockResolvedValue([
        {
          id: 'wd-3',
          endpointUrl: 'https://psi.internal/uprm/webhooks',
          signingSecret: 'supersecret1',
          payload: { eventType: 'reward.created' },
          attemptCount: 5,
          createdAt: new Date('2026-04-24T18:00:00.000Z'),
        },
      ]),
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markFailure: jest.fn().mockResolvedValue(undefined),
    };
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('server error'),
    });

    const dispatcher = new WebhookDispatcher(fetchImpl as any, service);
    await dispatcher.dispatchBatch(new Date('2026-04-24T18:05:00.000Z'));

    expect(service.markFailure.mock.calls[0][1].deadLetter).toBe(true);
  });
});
