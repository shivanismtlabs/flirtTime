import type { FeeRule, PayoutMethod, WithdrawPaymentSettings } from './wallet.types.js';

const DEFAULT_WITHDRAW: WithdrawPaymentSettings = {
  feeType: 'percent',
  feePercent: 5,
  feeFlat: 0,
  minAmount: 100,
  maxAmount: 100_000,
  enabledMethods: ['bank', 'paypal', 'crypto'],
  methodFees: {
    bank: { feeType: 'percent', feePercent: 5, feeFlat: 0 },
    paypal: { feeType: 'percent', feePercent: 7, feeFlat: 0 },
    crypto: { feeType: 'flat', feePercent: 0, feeFlat: 10 },
  },
  cryptoCurrencies: [
    { currency: 'USDT', networks: ['TRC20', 'ERC20', 'BEP20'] },
    { currency: 'BTC', networks: ['BTC'] },
  ],
};

export function parseWithdrawSettings(
  raw: unknown,
): WithdrawPaymentSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_WITHDRAW;
  const v = raw as Record<string, unknown>;
  return {
    ...DEFAULT_WITHDRAW,
    ...v,
    feeType: v.feeType === 'flat' ? 'flat' : 'percent',
    feePercent: Number(v.feePercent ?? DEFAULT_WITHDRAW.feePercent),
    feeFlat: Number(v.feeFlat ?? DEFAULT_WITHDRAW.feeFlat),
    minAmount: Number(v.minAmount ?? DEFAULT_WITHDRAW.minAmount),
    maxAmount: Number(v.maxAmount ?? DEFAULT_WITHDRAW.maxAmount),
    enabledMethods: Array.isArray(v.enabledMethods)
      ? (v.enabledMethods as PayoutMethod[])
      : DEFAULT_WITHDRAW.enabledMethods,
    methodFees:
      (v.methodFees as WithdrawPaymentSettings['methodFees']) ??
      DEFAULT_WITHDRAW.methodFees,
    cryptoCurrencies:
      (v.cryptoCurrencies as WithdrawPaymentSettings['cryptoCurrencies']) ??
      DEFAULT_WITHDRAW.cryptoCurrencies,
  };
}

export function resolveFeeRule(
  settings: WithdrawPaymentSettings,
  method: PayoutMethod,
): FeeRule {
  const methodFee = settings.methodFees?.[method];
  if (methodFee) {
    return {
      feeType: methodFee.feeType,
      feePercent: Number(methodFee.feePercent) || 0,
      feeFlat: Number(methodFee.feeFlat) || 0,
    };
  }
  return {
    feeType: settings.feeType,
    feePercent: settings.feePercent,
    feeFlat: settings.feeFlat,
  };
}

export function calculateWithdrawFee(
  amount: number,
  settings: WithdrawPaymentSettings,
  method: PayoutMethod,
): { feeAmount: number; netAmount: number; feeRule: FeeRule } {
  const feeRule = resolveFeeRule(settings, method);
  const feeAmount =
    feeRule.feeType === 'flat'
      ? Math.max(0, Math.floor(feeRule.feeFlat))
      : Math.max(
          0,
          Math.ceil((amount * Math.max(0, feeRule.feePercent)) / 100),
        );
  if (feeAmount >= amount) {
    return { feeAmount, netAmount: 0, feeRule };
  }
  return { feeAmount, netAmount: amount - feeAmount, feeRule };
}
