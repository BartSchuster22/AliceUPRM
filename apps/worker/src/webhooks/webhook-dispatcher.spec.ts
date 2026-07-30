import {
  WebhookDispatcher,
  type ClaimedWebhookDelivery,
  type FetchLike,
  type WebhookDeliveryStore,
} from './webhook-dispatcher';

const markDelivered = jest.fn<
  ReturnType<WebhookDeliveryStore['markDelivered']>,
  Parameters<WebhookDeliveryStore['markDelivered']>
>();
const markFailure = jest.fn<
  ReturnType<WebhookDeliveryStore['markFailure']>,
  Parameters<WebhookDeliveryStore['markFailure']>
>();

function makeService(rows: ClaimedWebhookDelivery[]): WebhookDeliveryStore {
  return {
    claimDueBatch: jest.fn().mockResolvedValue(rows),
    markDelivered,
    markFailure,
    replayDelivery: jest.fn(),
  };
}

function makeFetch(response: {
  ok: boolean;
  status: number;
  body: string;
}): FetchLike {
  return jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: jest.fn().mockResolvedValue(response.body),
  });
}

function delivery(id: string, attemptCount: number): ClaimedWebhookDelivery {
  return {
    id,
    endpointUrl: 'https://psi.internal/uprm/webhooks',
    signingSecret: 'supersecret1',
    payload: { eventType: 'reward.created' },
    attemptCount,
    createdAt: new Date('2026-04-24T18:00:00.000Z'),
  };
}

describe('WebhookDispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks successful deliveries as delivered', async () => {
    const service = makeService([delivery('wd-1', 0)]);
    const dispatcher = new WebhookDispatcher(
      makeFetch({ ok: true, status: 200, body: 'ok' }),
      service,
    );
    const delivered = await dispatcher.dispatchBatch(
      new Date('2026-04-24T18:05:00.000Z'),
    );

    expect(delivered).toBe(1);
    expect(markDelivered).toHaveBeenCalledWith('wd-1', 200);
    expect(markFailure).not.toHaveBeenCalled();
  });

  it('retries failed deliveries with backoff before dead-letter threshold', async () => {
    const service = makeService([delivery('wd-2', 1)]);
    const now = new Date('2026-04-24T18:05:00.000Z');
    const dispatcher = new WebhookDispatcher(
      makeFetch({ ok: false, status: 500, body: 'server error' }),
      service,
    );
    await dispatcher.dispatchBatch(now);

    expect(markFailure).toHaveBeenCalledTimes(1);
    expect(markFailure.mock.calls[0]?.[1].deadLetter).toBe(false);
  });

  it('dead-letters after the threshold is reached', async () => {
    const service = makeService([delivery('wd-3', 5)]);
    const dispatcher = new WebhookDispatcher(
      makeFetch({ ok: false, status: 500, body: 'server error' }),
      service,
    );
    await dispatcher.dispatchBatch(new Date('2026-04-24T18:05:00.000Z'));

    expect(markFailure.mock.calls[0]?.[1].deadLetter).toBe(true);
  });
});
