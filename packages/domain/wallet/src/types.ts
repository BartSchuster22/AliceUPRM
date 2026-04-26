export type CreditCurrency = 'credit';

export interface EnsureWalletAccountInput {
  userId: string;
  currency?: CreditCurrency;
}

export interface CreateWalletGrantInput {
  walletAccountId: string;
  issuerTenantId?: string | null;
  sourceTenantUserId?: string | null;
  originType: string;
  sourceEventId?: string | null;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
  amountIssued: bigint;
  fxQuoteId?: string | null;
  expiresAt?: Date | null;
}

export interface GrantLike {
  id: string;
  issuerTenantId?: string | null;
  amountRemaining: bigint;
  createdAt: Date;
}

export interface WalletAllocation {
  walletGrantId: string;
  issuerTenantId?: string | null;
  amountCredits: bigint;
}

export interface ReserveWalletRedemptionInput {
  walletAccountId: string;
  spendingTenantId: string;
  spendingTenantUserId?: string | null;
  purchaseRef?: string | null;
  orderRef?: string | null;
  amountCredits: bigint;
}

export interface ReserveWalletPayoutInput {
  walletAccountId: string;
  payoutRequestId: string;
  amountCredits: bigint;
}

export interface NormalizeToCreditsInput {
  amount: string;
  currency: string;
  eurRate?: string;
}
