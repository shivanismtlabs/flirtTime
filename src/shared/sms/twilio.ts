import { env } from '../config/index.js';
import { ServiceUnavailableError } from '../errors/index.js';
import { status } from '../logger/index.js';

function basicAuth(): string {
  return Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
}

export function isTwilioEnabled(): boolean {
  return (
    env.TWILIO_ENABLED &&
    Boolean(env.TWILIO_ACCOUNT_SID) &&
    Boolean(env.TWILIO_AUTH_TOKEN) &&
    Boolean(env.TWILIO_SERVICE_SID)
  );
}

/** E.164 e.g. +919876543210 */
export function toE164(countryCode: string, phoneNumber: string): string {
  const cc = countryCode.replace(/\D/g, '');
  const phone = phoneNumber.replace(/\D/g, '');
  return `+${cc}${phone}`;
}

type TwilioErrorBody = {
  code?: number;
  message?: string;
  status?: number;
};

function parseTwilioError(raw: string): TwilioErrorBody {
  try {
    return JSON.parse(raw) as TwilioErrorBody;
  } catch {
    return { message: raw };
  }
}

function twilioFailureMessage(statusCode: number, body: TwilioErrorBody): string {
  if (statusCode === 401 || body.code === 20003) {
    return 'Twilio authentication failed — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN';
  }
  if (body.code === 20404) {
    return 'Twilio Verify service not found — check TWILIO_SERVICE_SID';
  }
  if (body.code === 60200 || body.code === 21211) {
    return 'Invalid phone number for Twilio Verify';
  }
  if (body.code === 60203) {
    return 'Twilio max verification attempts reached for this number';
  }
  return body.message ? `Twilio: ${body.message}` : 'Failed to send SMS verification';
}

export async function twilioSendVerification(toE164: string): Promise<void> {
  const url = `https://verify.twilio.com/v2/Services/${env.TWILIO_SERVICE_SID}/Verifications`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toE164, Channel: 'sms' }),
  });

  if (!res.ok) {
    const raw = await res.text();
    const body = parseTwilioError(raw);
    status.fail('Twilio', `send failed ${res.status}: ${raw}`);
    throw new ServiceUnavailableError(twilioFailureMessage(res.status, body), {
      provider: 'twilio',
      status: res.status,
      code: body.code,
    });
  }
}

export async function twilioCheckVerification(
  toE164: string,
  code: string,
): Promise<boolean> {
  const url = `https://verify.twilio.com/v2/Services/${env.TWILIO_SERVICE_SID}/VerificationCheck`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toE164, Code: code }),
  });

  if (!res.ok) {
    const raw = await res.text();
    status.fail('Twilio', `check failed ${res.status}: ${raw}`);
    return false;
  }

  const data = (await res.json()) as { status?: string };
  return data.status === 'approved';
}
