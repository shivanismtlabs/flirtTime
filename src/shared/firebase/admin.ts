import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { env } from '../config/index.js';
import { status } from '../logger/index.js';

let initialized = false;
/** True after first init attempt (success or skip/fail) — avoids repeat boot logs. */
let initAttempted = false;
let app: App | null = null;

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

/** .env often stores PEM with literal `\n` — normalize to real newlines. */
function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n');
}

function loadServiceAccount(): ServiceAccountJson | null {
  if (
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_CLIENT_EMAIL &&
    env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      project_id: env.FIREBASE_PROJECT_ID,
      client_email: env.FIREBASE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
    };
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccountJson;
    } catch {
      status.fail(
        'Firebase',
        'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON',
      );
      return null;
    }
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    try {
      const path = resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const raw = readFileSync(path, 'utf8');
      return JSON.parse(raw) as ServiceAccountJson;
    } catch {
      status.fail(
        'Firebase',
        `Could not read service account at ${env.FIREBASE_SERVICE_ACCOUNT_PATH}`,
      );
      return null;
    }
  }

  return null;
}

/** Initialize Firebase Admin once. No-ops when disabled / missing credentials. */
export function initFirebase(): boolean {
  if (initialized) return true;
  if (initAttempted) return false;
  initAttempted = true;

  if (!env.FIREBASE_ENABLED) {
    status.skip('Firebase', 'disabled (FIREBASE_ENABLED=false)');
    return false;
  }

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0] ?? null;
    initialized = Boolean(app);
    return initialized;
  }

  const account = loadServiceAccount();
  if (!account?.project_id || !account.client_email || !account.private_key) {
    status.fail(
      'Firebase',
      'enabled but missing creds (set FIREBASE_PROJECT_ID + CLIENT_EMAIL + PRIVATE_KEY)',
    );
    return false;
  }

  try {
    const serviceAccount: ServiceAccount = {
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: normalizePrivateKey(account.private_key),
    };
    app = initializeApp({
      credential: cert(serviceAccount),
      ...(env.FIREBASE_DATABASE_URL
        ? { databaseURL: env.FIREBASE_DATABASE_URL }
        : {}),
    });
    initialized = true;
    status.ok('Firebase', `project ${account.project_id}`);
    return true;
  } catch (err) {
    status.fail(
      'Firebase',
      err instanceof Error ? err.message : 'initializeApp failed',
    );
    return false;
  }
}

export function isFirebaseReady(): boolean {
  return initFirebase();
}

export function getFirebaseMessaging(): Messaging | null {
  if (!isFirebaseReady() || !app) return null;
  return getMessaging(app);
}

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseReady() || !app) return null;
  return getAuth(app);
}
