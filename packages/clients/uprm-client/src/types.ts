export type UprmClientConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  userAgent?: string;
  fetch?: typeof fetch;
  now?: () => number;
};

export type UprmRequestOptions = {
  signal?: AbortSignal;
  headers?: HeadersInit;
  idempotencyKey?: string;
  timeoutMs?: number;
  maxAttempts?: number;
};

export type UprmHttpRequest = {
  method: string;
  path: string;
  body?: unknown;
} & UprmRequestOptions;

export type CreateUserInput = {
  email: string;
  externalUserId: string;
  username?: string;
};

export type TenantUserRecord = {
  id: string;
  tenantId: string;
  userId: string;
  externalUserId: string;
  username: string | null;
  tenantStatus: string;
  metadata: unknown;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    emailNormalized: string;
    emailVerified: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
};

export type CreateUserResponse = {
  tenant_user: TenantUserRecord;
};

export type CreateReferralCodeInput = {
  tenantUserId: string;
  expiresAt?: string;
};

export type ReferralCodeRecord = {
  id: string;
  tenantId: string;
  tenantUserId: string;
  code: string;
  status: string;
  expiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ApplyReferralCodeInput = {
  referredTenantUserId: string;
  code: string;
};

export type ReferralEdgeRecord = {
  id: string;
  tenantId: string;
  referrerTenantUserId: string;
  referredTenantUserId: string;
  lockedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ApplyReferralCodeResponse = {
  edge: ReferralEdgeRecord;
};

export type UprmEventType =
  | 'user_registered'
  | 'email_verified'
  | 'subscription_started'
  | 'subscription_paid'
  | 'invoice_paid'
  | 'purchase_completed'
  | 'refund_issued'
  | 'subscription_cancelled'
  | 'chargeback_opened'
  | 'chargeback_won'
  | 'chargeback_lost';

export type UprmEventBase = {
  eventType: UprmEventType;
  idempotencyKey: string;
  externalEventId: string;
  externalUserId?: string;
  occurredAt?: string;
  linkedExternalEventId?: string;
};

export type UserRegisteredEvent = UprmEventBase & {
  eventType: 'user_registered';
  externalUserId: string;
  email?: string;
  referralCode?: string;
  metadata?: Record<string, unknown>;
};

export type EmailVerifiedEvent = UprmEventBase & {
  eventType: 'email_verified';
  externalUserId: string;
};

export type SubscriptionStartedEvent = UprmEventBase & {
  eventType: 'subscription_started';
  externalUserId: string;
  subscriptionId: string;
  plan: string;
  amount: string;
  currency: string;
  metadata?: Record<string, unknown>;
};

export type SubscriptionPaidEvent = UprmEventBase & {
  eventType: 'subscription_paid';
  externalUserId: string;
  subscriptionId: string;
  amount: string;
  currency: string;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
};

export type InvoicePaidEvent = UprmEventBase & {
  eventType: 'invoice_paid';
  externalUserId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  metadata?: Record<string, unknown>;
};

export type PurchaseCompletedEvent = UprmEventBase & {
  eventType: 'purchase_completed';
  externalUserId: string;
  purchaseId: string;
  amount: string;
  currency: string;
  metadata?: Record<string, unknown>;
};

export type RefundIssuedEvent = UprmEventBase & {
  eventType: 'refund_issued';
  externalUserId: string;
  linkedExternalEventId: string;
  amount: string;
  currency: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type SubscriptionCancelledEvent = UprmEventBase & {
  eventType: 'subscription_cancelled';
  externalUserId: string;
  subscriptionId: string;
  reason?: string;
};

export type ChargebackOpenedEvent = UprmEventBase & {
  eventType: 'chargeback_opened';
  externalUserId: string;
  linkedExternalEventId: string;
  amount: string;
  currency: string;
  metadata?: Record<string, unknown>;
};

export type ChargebackWonEvent = UprmEventBase & {
  eventType: 'chargeback_won';
  externalUserId: string;
  linkedExternalEventId: string;
};

export type ChargebackLostEvent = UprmEventBase & {
  eventType: 'chargeback_lost';
  externalUserId: string;
  linkedExternalEventId: string;
};

export type SubmitEventInput =
  | UserRegisteredEvent
  | EmailVerifiedEvent
  | SubscriptionStartedEvent
  | SubscriptionPaidEvent
  | InvoicePaidEvent
  | PurchaseCompletedEvent
  | RefundIssuedEvent
  | SubscriptionCancelledEvent
  | ChargebackOpenedEvent
  | ChargebackWonEvent
  | ChargebackLostEvent;

export type SubmitEventResponse = {
  event_id: string;
  processing_status: string;
  duplicate: boolean;
};

export type Wallet = {
  tenant_user_id: string;
  base_currency: string;
  balance_credits: number;
  balance_display: string;
  balance_as_money: {
    amount_minor: number;
    formatted: string;
  };
};

export type UserProfile = {
  userId: string;
  email: string;
  fullName: string;
  referralCode: string | null;
  emailVerified: boolean;
  userStatus: string;
  profileId: string | null;
  accountType: 'private' | 'business' | null;
  companyName: string | null;
  taxId: string | null;
  phone: string | null;
  country: string | null;
  onboardingState: string | null;
};

export type SubscriptionSummary = {
  externalSubscriptionId: string;
  status: string;
  plan: string;
  amountMinor: number;
  currency: string;
  startedAt: string;
  cancelledAt: string | null;
};

export type GetSubscriptionsByExternalUserIdResponse = {
  subscriptions: SubscriptionSummary[];
};

export type ReferralSummaryReferral = {
  id: string;
  referred_tenant_user_id: string;
  referred_external_user_id: string | null;
  referral_code: string;
  locked: boolean;
  created_at: string;
  locked_at: string | null;
};

export type ReferralSummaryLedgerEntry = {
  id: string;
  amount_cents: number;
  status: string;
  reason: string;
  created_at: string;
};

export type ReferralSummary = {
  tenant_user_id: string;
  external_user_id: string;
  referral_code: string;
  active_count: number;
  converted_count: number;
  total_credit_cents: number;
  referrals: ReferralSummaryReferral[];
  ledger: ReferralSummaryLedgerEntry[];
};

export type CreateCheckoutSessionInput = {
  externalUserId: string;
  plan: string;
  productName: string;
  productDescription?: string;
  amountMinor: number;
  currency: string;
  billingInterval: 'month' | 'year';
  successUrl: string;
  cancelUrl: string;
  referralCodeUsed?: string;
};

export type CheckoutSession = {
  sessionId: string;
  url: string;
};
