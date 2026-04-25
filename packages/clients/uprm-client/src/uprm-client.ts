import { UprmHttpClient } from './http.js';
import type {
  ApplyReferralCodeInput,
  ApplyReferralCodeResponse,
  CheckoutSession,
  CreateCheckoutSessionInput,
  CreateReferralCodeInput,
  CreateUserInput,
  CreateUserResponse,
  GetSubscriptionsByExternalUserIdResponse,
  ReferralCodeRecord,
  ReferralSummary,
  RegisterProductInput,
  RegisterProductResponse,
  SubmitEventInput,
  SubmitEventResponse,
  UprmClientConfig,
  UprmRequestOptions,
  UserProfile,
  Wallet,
} from './types.js';

export class UprmClient {
  private readonly http: UprmHttpClient;

  constructor(private readonly config: UprmClientConfig) {
    this.http = new UprmHttpClient(config);
  }

  getConfig(): UprmClientConfig {
    return this.config;
  }

  async createUser(
    input: CreateUserInput,
    options?: UprmRequestOptions,
  ): Promise<CreateUserResponse> {
    return this.http.requestJson<CreateUserResponse>({
      method: 'POST',
      path: '/v1/users',
      body: input,
      ...options,
    });
  }

  async createReferralCode(
    input: CreateReferralCodeInput,
    options?: UprmRequestOptions,
  ): Promise<ReferralCodeRecord> {
    return this.http.requestJson<ReferralCodeRecord>({
      method: 'POST',
      path: '/v1/referrals/codes',
      body: input,
      ...options,
    });
  }

  async applyReferralCode(
    input: ApplyReferralCodeInput,
    options?: UprmRequestOptions,
  ): Promise<ApplyReferralCodeResponse> {
    return this.http.requestJson<ApplyReferralCodeResponse>({
      method: 'POST',
      path: '/v1/referrals/apply',
      body: input,
      ...options,
    });
  }

  async submitEvent(
    input: SubmitEventInput,
    options?: UprmRequestOptions,
  ): Promise<SubmitEventResponse> {
    return this.http.requestJson<SubmitEventResponse>({
      method: 'POST',
      path: '/v1/events',
      body: input,
      idempotencyKey: options?.idempotencyKey ?? input.idempotencyKey,
      ...options,
    });
  }

  async getWallet(tenantUserId: string, options?: UprmRequestOptions): Promise<Wallet> {
    return this.http.requestJson<Wallet>({
      method: 'GET',
      path: `/v1/users/${encodeURIComponent(tenantUserId)}/balance`,
      ...options,
    });
  }

  async getUserProfileByExternalUserId(
    externalUserId: string,
    options?: UprmRequestOptions,
  ): Promise<UserProfile> {
    return this.http.requestJson<UserProfile>({
      method: 'GET',
      path: `/v1/users/external/${encodeURIComponent(externalUserId)}/profile`,
      ...options,
    });
  }

  async getSubscriptionsByExternalUserId(
    externalUserId: string,
    options?: UprmRequestOptions,
  ): Promise<GetSubscriptionsByExternalUserIdResponse> {
    return this.http.requestJson<GetSubscriptionsByExternalUserIdResponse>({
      method: 'GET',
      path: `/v1/users/external/${encodeURIComponent(externalUserId)}/subscriptions`,
      ...options,
    });
  }

  async getReferralSummaryByExternalUserId(
    externalUserId: string,
    options?: UprmRequestOptions,
  ): Promise<ReferralSummary> {
    return this.http.requestJson<ReferralSummary>({
      method: 'GET',
      path: `/v1/referrals/users/${encodeURIComponent(externalUserId)}/summary`,
      ...options,
    });
  }

  async registerProduct(
    input: RegisterProductInput,
    options?: UprmRequestOptions,
  ): Promise<RegisterProductResponse> {
    return this.http.requestJson<RegisterProductResponse>({
      method: 'POST',
      path: '/v1/products/register',
      body: input,
      ...options,
    });
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
    options?: UprmRequestOptions,
  ): Promise<CheckoutSession> {
    return this.http.requestJson<CheckoutSession>({
      method: 'POST',
      path: '/v1/billing/checkout-sessions',
      body: input,
      ...options,
    });
  }
}

export function createUprmClient(config: UprmClientConfig): UprmClient {
  return new UprmClient(config);
}
