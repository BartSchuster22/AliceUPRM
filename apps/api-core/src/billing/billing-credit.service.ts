import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdentityService } from '@uprm/identity';
import {
  WalletAccountService,
  WalletBalanceService,
  WalletRedemptionService,
} from '@uprm/wallet';

interface PrepareBillingCheckoutInput {
  tenantId: string;
  externalUserId: string;
  amountMinor: number;
  applyCredits?: boolean;
  creditsToUse?: number;
}

interface PreparedBillingCheckout {
  adjustedAmountMinor: number;
  appliedCredits?: number;
  walletRedemptionId?: string;
  tenantUserId?: string;
  userId?: string;
}

export class BillingCreditService {
  private readonly identity = new IdentityService();
  private readonly walletAccounts = new WalletAccountService();
  private readonly walletBalances = new WalletBalanceService();
  private readonly walletRedemptions = new WalletRedemptionService();

  async prepareCheckout(
    input: PrepareBillingCheckoutInput,
  ): Promise<PreparedBillingCheckout> {
    if (!input.applyCredits && !input.creditsToUse) {
      return { adjustedAmountMinor: input.amountMinor };
    }

    const requestedCredits = Math.trunc(Number(input.creditsToUse ?? 0));
    if (requestedCredits <= 0) {
      throw new BadRequestException('creditsToUse must be greater than 0');
    }

    const tenantUser = await this.identity.getTenantUserByExternalUserId(
      input.tenantId,
      input.externalUserId,
    );
    if (!tenantUser?.user?.id || !tenantUser.id) {
      throw new NotFoundException('tenant user not found');
    }

    const walletAccount = await this.walletAccounts.ensureAccount({
      userId: tenantUser.user.id,
    });
    const balance = await this.walletBalances.getWalletBalance(walletAccount.id);
    const spendableCredits = Number(balance.balanceCredits ?? 0n);
    const appliedCredits = Math.min(requestedCredits, spendableCredits, input.amountMinor);

    if (appliedCredits <= 0) {
      throw new BadRequestException('insufficient credit balance');
    }

    const reservation = await this.walletRedemptions.reserveRedemption({
      walletAccountId: walletAccount.id,
      spendingTenantId: input.tenantId,
      spendingTenantUserId: tenantUser.id,
      amountCredits: BigInt(appliedCredits),
    });

    return {
      adjustedAmountMinor: input.amountMinor - appliedCredits,
      appliedCredits,
      walletRedemptionId: reservation.redemption.id,
      tenantUserId: tenantUser.id,
      userId: tenantUser.user.id,
    };
  }
}
