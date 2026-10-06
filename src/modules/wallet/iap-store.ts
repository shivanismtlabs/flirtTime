import { JWT } from 'google-auth-library';
import * as jose from 'jose';
import { env } from '../../shared/config/index.js';
import {
  ServiceUnavailableError,
  ValidationError,
} from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import type { PurchasePlatform } from './wallet.types.js';

const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const APPLE_AUD = 'appstoreconnect-v1';
const APPLE_PROD =
  'https://api.storekit.itunes.apple.com/inApps/v1/transactions';
const APPLE_SANDBOX =
  'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions';
/** App Store Server API: transaction id not found (try sandbox). */
const APPLE_TX_NOT_FOUND = 4040010;

export type StoreVerifyInput = {
  platform: PurchasePlatform;
  productId: string;
  storeTransactionId: string;
  storePurchaseToken?: string;
  storeReceipt?: string;
};

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n').trim();
}

export function isWebDevPurchase(input: {
  storeTransactionId: string;
  storePurchaseToken?: string;
}): boolean {
  const token = input.storePurchaseToken?.trim() ?? '';
  const tx = input.storeTransactionId.trim();
  return token === 'web-dev' || tx.startsWith('web-');
}

export function isGooglePlayConfigured(): boolean {
  return Boolean(
    env.GOOGLE_PLAY_CLIENT_EMAIL &&
      env.GOOGLE_PLAY_PRIVATE_KEY &&
      env.GOOGLE_PLAY_PACKAGE_NAME,
  );
}

export function isAppleIapConfigured(): boolean {
  return Boolean(
    env.APPLE_IAP_ISSUER_ID &&
      env.APPLE_IAP_KEY_ID &&
      env.APPLE_IAP_PRIVATE_KEY &&
      env.APPLE_IAP_BUNDLE_ID,
  );
}

function looksLikeJws(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function strClaim(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const v = payload[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

let playClient: JWT | null = null;
let appleKey: Awaited<ReturnType<typeof jose.importPKCS8>> | null = null;

function getPlayClient(): JWT {
  if (!playClient) {
    playClient = new JWT({
      email: env.GOOGLE_PLAY_CLIENT_EMAIL,
      key: normalizePrivateKey(env.GOOGLE_PLAY_PRIVATE_KEY),
      scopes: [PLAY_SCOPE],
    });
  }
  return playClient;
}

async function getAppleSigningKey(): Promise<
  Awaited<ReturnType<typeof jose.importPKCS8>>
> {
  if (!appleKey) {
    appleKey = await jose.importPKCS8(
      normalizePrivateKey(env.APPLE_IAP_PRIVATE_KEY),
      'ES256',
    );
  }
  return appleKey;
}

async function appleIapAccessToken(): Promise<string> {
  const key = await getAppleSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ bid: env.APPLE_IAP_BUNDLE_ID })
    .setProtectedHeader({
      alg: 'ES256',
      kid: env.APPLE_IAP_KEY_ID,
      typ: 'JWT',
    })
    .setIssuer(env.APPLE_IAP_ISSUER_ID)
    .setAudience(APPLE_AUD)
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60)
    .sign(key);
}

type PlayProductPurchase = {
  purchaseState?: number;
  orderId?: string;
  consumptionState?: number;
  acknowledgementState?: number;
  /** 0 = license-tester / test purchase */
  purchaseType?: number;
};

export type StoreVerifyResult = {
  isTest: boolean;
  environment: 'production' | 'sandbox' | 'test' | 'dev';
};

type AndroidBillingReceipt = {
  orderId?: string;
  packageName?: string;
  productId?: string;
  purchaseToken?: string;
  purchaseState?: number;
};

function googleApiErrorMessage(err: unknown): {
  status: number | null;
  message: string;
} {
  const rec =
    err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const response =
    rec && rec.response && typeof rec.response === 'object'
      ? (rec.response as Record<string, unknown>)
      : null;
  const status = typeof response?.status === 'number' ? response.status : null;
  const data = response?.data;
  let message = '';
  if (data && typeof data === 'object') {
    const error = (data as { error?: { message?: unknown } }).error;
    if (typeof error?.message === 'string' && error.message.trim()) {
      message = error.message.trim();
    }
  }
  if (!message && err instanceof Error && err.message.trim()) {
    message = err.message.trim();
  }
  return { status, message };
}

/** Play Billing `Purchase.toJson()` sent as storeReceipt. */
function parseAndroidBillingReceipt(
  raw: string | undefined,
): AndroidBillingReceipt | null {
  if (!raw?.trim() || raw.trim().startsWith('eyJ')) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as AndroidBillingReceipt;
  } catch {
    return null;
  }
}

/**
 * License-tester receipt when Developer API is down / not granted
 * (Linkgram Android path: matching GPA order + token + product still credits).
 */
function androidTestReceiptFallback(
  input: StoreVerifyInput,
): StoreVerifyResult | null {
  const receipt = parseAndroidBillingReceipt(input.storeReceipt);
  if (!receipt) return null;
  const token = input.storePurchaseToken?.trim() ?? '';
  const orderId = (receipt.orderId ?? '').trim();
  const pkg = (receipt.packageName ?? '').trim();
  const productId = (receipt.productId ?? '').trim();
  const purchaseToken = (receipt.purchaseToken ?? '').trim();
  if (receipt.purchaseState !== 0) return null;
  if (!orderId.startsWith('GPA.')) return null;
  if (pkg && pkg !== env.GOOGLE_PLAY_PACKAGE_NAME) return null;
  if (productId && productId !== input.productId) return null;
  if (token && purchaseToken && purchaseToken !== token) return null;
  if (
    orderId &&
    input.storeTransactionId.trim() &&
    orderId !== input.storeTransactionId.trim()
  ) {
    return null;
  }
  return { isTest: true, environment: 'test' };
}

async function verifyGooglePlay(
  input: StoreVerifyInput,
): Promise<StoreVerifyResult> {
  if (!isGooglePlayConfigured()) {
    throw new ValidationError(
      'Store verification is not configured (set GOOGLE_PLAY_* or IAP_SKIP_STORE_VERIFY=true for dev)',
    );
  }

  const token = input.storePurchaseToken?.trim();
  if (!token) {
    throw new ValidationError('storePurchaseToken is required for Android');
  }

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)}/purchases/products/` +
    `${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(token)}`;

  try {
    const res = await getPlayClient().request<PlayProductPurchase>({ url });
    const body = res.data ?? {};
    if (body.purchaseState !== 0) {
      throw new ValidationError('Google Play purchase is not completed');
    }

    const isTest = body.purchaseType === 0;
    const orderId = body.orderId?.trim();
    const storeTx = input.storeTransactionId.trim();
    if (!isTest && orderId && storeTx && orderId !== storeTx) {
      throw new ValidationError(
        'storeTransactionId does not match Play orderId',
      );
    }

    return {
      isTest,
      environment: isTest ? 'test' : 'production',
    };
  } catch (err) {
    if (err instanceof ValidationError) throw err;

    const { status, message } = googleApiErrorMessage(err);
    logger.error(
      { status, googleMessage: message },
      'Google Play IAP verify failed',
    );

    const fallback = androidTestReceiptFallback(input);
    if (fallback) {
      logger.warn(
        { status, productId: input.productId },
        'Google Play API failed; crediting matching license-test receipt',
      );
      return fallback;
    }

    if (status != null && status >= 500) {
      throw new ServiceUnavailableError('Google Play verification unavailable');
    }
    const hint =
      status === 401 || status === 403
        ? ' Grant this service account Play Console access and enable the Android Publisher API.'
        : '';
    throw new ValidationError(
      message
        ? `Google Play purchase could not be verified: ${message}`
        : `Google Play purchase could not be verified${status != null ? ` (${status})` : ''}.${hint}`,
    );
  }
}

type AppleTxPayload = Record<string, unknown>;

function appleErrorCode(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const code = (body as { errorCode?: unknown }).errorCode;
  return typeof code === 'number' ? code : null;
}

function decodeAppleTxJws(jws: string): AppleTxPayload {
  try {
    return jose.decodeJwt(jws) as AppleTxPayload;
  } catch {
    throw new ValidationError('Invalid Apple transaction receipt');
  }
}

function assertAppleTransaction(
  payload: AppleTxPayload,
  expectedProductId: string,
  storeTransactionId: string,
  isTest: boolean,
): void {
  const productId = strClaim(payload, 'productId');
  const bundleId = strClaim(payload, 'bundleId');
  const transactionId = strClaim(payload, 'transactionId');
  const originalTransactionId = strClaim(payload, 'originalTransactionId');
  const type = strClaim(payload, 'type');
  const revocationDate = payload.revocationDate;

  if (bundleId && bundleId !== env.APPLE_IAP_BUNDLE_ID) {
    throw new ValidationError('Apple purchase bundleId does not match');
  }
  if (productId && productId !== expectedProductId) {
    throw new ValidationError('Apple purchase productId does not match');
  }
  if (revocationDate != null && revocationDate !== '') {
    throw new ValidationError('Apple purchase has been revoked');
  }
  if (type && /subscription/i.test(type)) {
    throw new ValidationError('Apple subscription purchases are not supported');
  }

  const ids = [transactionId, originalTransactionId].filter(Boolean);
  if (
    !isTest &&
    storeTransactionId &&
    ids.length > 0 &&
    !ids.includes(storeTransactionId)
  ) {
    throw new ValidationError(
      'storeTransactionId does not match Apple transaction',
    );
  }
}

async function fetchAppleTransaction(
  baseUrl: string,
  transactionId: string,
  accessToken: string,
): Promise<{ status: number; body: unknown }> {
  const url = `${baseUrl}/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function resolveAppleTransactionId(input: StoreVerifyInput): string {
  const receipt = input.storeReceipt?.trim();
  if (receipt && looksLikeJws(receipt)) {
    const payload = decodeAppleTxJws(receipt);
    const fromJws =
      strClaim(payload, 'transactionId') ??
      strClaim(payload, 'originalTransactionId');
    if (fromJws) return fromJws;
  }
  return input.storeTransactionId.trim();
}

async function verifyAppleIap(input: StoreVerifyInput): Promise<StoreVerifyResult> {
  if (!isAppleIapConfigured()) {
    throw new ValidationError(
      'Store verification is not configured (set APPLE_IAP_* or IAP_SKIP_STORE_VERIFY=true for dev)',
    );
  }

  const transactionId = resolveAppleTransactionId(input);
  if (!transactionId) {
    throw new ValidationError('storeTransactionId is required for iOS');
  }

  let accessToken: string;
  try {
    accessToken = await appleIapAccessToken();
  } catch (err) {
    logger.error({ err }, 'Apple IAP JWT sign failed');
    throw new ServiceUnavailableError('App Store verification unavailable');
  }

  let prod: { status: number; body: unknown };
  try {
    prod = await fetchAppleTransaction(APPLE_PROD, transactionId, accessToken);
  } catch (err) {
    logger.error({ err }, 'Apple IAP production request failed');
    throw new ServiceUnavailableError('App Store verification unavailable');
  }

  let chosen = prod;
  const prodMiss =
    prod.status === 401 ||
    prod.status === 404 ||
    appleErrorCode(prod.body) === APPLE_TX_NOT_FOUND;

  if (prodMiss) {
    try {
      chosen = await fetchAppleTransaction(
        APPLE_SANDBOX,
        transactionId,
        accessToken,
      );
    } catch (err) {
      logger.error({ err }, 'Apple IAP sandbox request failed');
      throw new ServiceUnavailableError('App Store verification unavailable');
    }
  }

  if (chosen.status >= 500) {
    throw new ServiceUnavailableError('App Store verification unavailable');
  }
  if (chosen.status === 401 || chosen.status === 403) {
    throw new ValidationError(
      'Store verification is not configured (invalid Apple IAP credentials)',
    );
  }
  if (chosen.status !== 200) {
    throw new ValidationError('Apple purchase could not be verified');
  }

  const signed = (chosen.body as { signedTransactionInfo?: unknown })
    ?.signedTransactionInfo;
  if (typeof signed !== 'string' || !looksLikeJws(signed)) {
    throw new ValidationError('Apple purchase could not be verified');
  }

  const payload = decodeAppleTxJws(signed);
  const appleEnv = (strClaim(payload, 'environment') ?? '').toLowerCase();
  const isTest = appleEnv === 'sandbox' || appleEnv === 'xcode';
  assertAppleTransaction(
    payload,
    input.productId,
    input.storeTransactionId.trim(),
    isTest,
  );
  return {
    isTest,
    environment: isTest ? 'sandbox' : 'production',
  };
}

/** Verify a native store purchase. Throws ValidationError / ServiceUnavailableError. */
export async function verifyStorePurchase(
  input: StoreVerifyInput,
): Promise<StoreVerifyResult> {
  if (input.platform === 'android') {
    return verifyGooglePlay(input);
  }
  return verifyAppleIap(input);
}
