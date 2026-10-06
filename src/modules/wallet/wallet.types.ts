export type WalletBucket = 'available' | 'earned';

export type WalletTxType =
  | 'topup'
  | 'send'
  | 'receive'
  | 'earn'
  | 'withdraw'
  | 'spend'
  | 'adjust';

export type WalletTxDirection = 'credit' | 'debit';

export type PayoutMethod = 'bank' | 'paypal' | 'crypto';

export type WithdrawStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'cancelled';

export type PurchasePlatform = 'android' | 'ios';

export type PurchaseStatus =
  | 'pending'
  | 'verified'
  | 'credited'
  | 'failed'
  | 'refunded';

export type FeeRule = {
  feeType: 'percent' | 'flat';
  feePercent: number;
  feeFlat: number;
};

export type WithdrawPaymentSettings = {
  feeType: 'percent' | 'flat';
  feePercent: number;
  feeFlat: number;
  minAmount: number;
  maxAmount: number;
  enabledMethods: PayoutMethod[];
  methodFees?: Partial<Record<PayoutMethod, FeeRule>>;
  cryptoCurrencies?: Array<{ currency: string; networks: string[] }>;
};

export type WalletDto = {
  id: string;
  availableCoins: number;
  earnedCoins: number;
  currency: string;
  updatedAt: string;
};

export type WalletTransactionDto = {
  id: string;
  type: WalletTxType;
  bucket: WalletBucket;
  direction: WalletTxDirection;
  amount: number;
  balanceAfter: number;
  counterpartyUserId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type WithdrawalProcessedBy = {
  id: string;
  fullName: string;
  email: string;
};

export type WithdrawalDto = {
  id: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  payoutMethod: PayoutMethod;
  payoutDetails: Record<string, unknown>;
  status: WithdrawStatus;
  adminNote: string | null;
  /** Staff admin who last approved / rejected / paid / cancelled */
  processedBy: WithdrawalProcessedBy | null;
  createdAt: string;
  processedAt: string | null;
};

export type FeePreview = {
  amount: number;
  feeAmount: number;
  netAmount: number;
  payoutMethod: PayoutMethod;
};
