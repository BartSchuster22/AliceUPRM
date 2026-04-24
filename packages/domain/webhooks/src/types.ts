export const OUTBOUND_EVENT_TYPES = [
  'reward.created',
  'reward.approved',
  'refund.reversed',
  'wallet.balance.changed',
] as const;

export type OutboundEventType = (typeof OUTBOUND_EVENT_TYPES)[number];

export interface OutboundWebhookEvent<TPayload = Record<string, unknown>> {
  eventType: OutboundEventType;
  tenantId: string;
  occurredAt: string;
  payload: TPayload;
  sourceEventId?: string;
  sourceTopic?: string;
}

export interface OutboundWebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  eventTypes: OutboundEventType[];
}

export interface OutboundWebhookConfig {
  enabled: boolean;
  endpoints: OutboundWebhookEndpoint[];
}

export interface WebhookSignature {
  timestamp: number;
  header: string;
  payloadJson: string;
  digest: string;
}
