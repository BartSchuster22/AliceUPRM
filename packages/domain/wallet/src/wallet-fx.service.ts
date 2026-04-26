import type { NormalizeToCreditsInput } from './types';

const CREDIT_DECIMALS = 100n;

export class WalletFxService {
  normalizeToCredits(input: NormalizeToCreditsInput) {
    const sourceCurrency = input.currency.toUpperCase();
    const amountMinor = decimalToMinor(input.amount);

    let eurMinor: bigint;
    if (sourceCurrency === 'EUR') {
      eurMinor = amountMinor;
    } else {
      if (!input.eurRate) {
        throw new Error('eurRate is required for non-EUR normalization');
      }
      eurMinor = multiplyMinorByDecimal(amountMinor, input.eurRate);
    }

    return {
      sourceCurrency,
      sourceAmountMinor: amountMinor,
      eurMinor,
      credits: eurMinor,
      peg: `1 Credit = 1 euro cent`,
    };
  }
}

function decimalToMinor(value: string): bigint {
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error('amount must be a decimal string with up to 2 fraction digits');
  }
  const wholePart = match[1] ?? '0';
  const fractionPart = (match[2] ?? '').padEnd(2, '0') || '0';
  const whole = BigInt(wholePart);
  const fraction = BigInt(fractionPart);
  return whole * CREDIT_DECIMALS + fraction;
}

function multiplyMinorByDecimal(minor: bigint, decimal: string): bigint {
  const match = decimal.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) {
    throw new Error('eurRate must be a decimal string with up to 6 fraction digits');
  }
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(6, '0');
  const scaled = BigInt(whole + fraction);
  return (minor * scaled + 500_000n) / 1_000_000n;
}
