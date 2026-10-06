import nodemailer from 'nodemailer';
import { env } from '../config/index.js';
import { ServiceUnavailableError } from '../errors/index.js';
import { status } from '../logger/index.js';

export function isSendGridEnabled(): boolean {
  return (
    env.SENDGRID_ENABLED &&
    Boolean(env.SENDGRID_API_KEY) &&
    Boolean(env.SENDGRID_SENDER_EMAIL)
  );
}

export function isSmtpEnabled(): boolean {
  return (
    env.SMTP_ENABLED &&
    Boolean(env.SMTP_HOST) &&
    Boolean(env.SMTP_USER) &&
    Boolean(env.SMTP_PASS)
  );
}

/** Prefer SendGrid; fall back to SMTP. */
export function isEmailEnabled(): boolean {
  return isSendGridEnabled() || isSmtpEnabled();
}

/**
 * Match Linkgram auth mailer exactly:
 * host smtp.office365.com, port 587, secure false,
 * from = `"OneVibe" <SMTP_USER>` (always the login mailbox).
 */
async function sendViaSmtp(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.office365.com',
    port: env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"OneVibe" <${env.SMTP_USER}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status.fail('SMTP', `send failed: ${message}`);
    throw new ServiceUnavailableError(`Failed to send email: ${message}`, {
      provider: 'smtp',
      detail: message,
    });
  }
}

async function sendViaSendGrid(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const content: Array<{ type: string; value: string }> = [
    { type: 'text/plain', value: input.text },
  ];
  if (input.html) {
    content.push({ type: 'text/html', value: input.html });
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: {
        email: env.SENDGRID_SENDER_EMAIL,
        name: 'OneVibe',
      },
      subject: input.subject,
      content,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    status.fail('SendGrid', `send failed ${res.status}: ${raw}`);
    let detail = `SendGrid HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(raw) as {
        errors?: Array<{ message?: string }>;
      };
      const msg = parsed.errors?.[0]?.message?.trim();
      if (msg) detail = msg;
    } catch {
      // keep generic detail
    }
    throw new ServiceUnavailableError(`Failed to send email: ${detail}`, {
      provider: 'sendgrid',
      status: res.status,
      detail,
    });
  }
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (isSendGridEnabled()) {
    await sendViaSendGrid(input);
    return;
  }
  if (isSmtpEnabled()) {
    await sendViaSmtp(input);
    return;
  }
  throw new ServiceUnavailableError('Email delivery is not configured', {
    provider: 'email',
  });
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose:
    | 'signup'
    | 'login'
    | 'reset_password'
    | 'change_email'
    | 'change_phone',
): Promise<void> {
  const label =
    purpose === 'reset_password'
      ? 'password reset'
      : purpose === 'change_email'
        ? 'email change'
        : purpose === 'signup'
          ? 'signup'
          : 'login';
  const subject = `Your OneVibe ${label} code`;
  const text = `Your OneVibe verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1c1410">
      <p style="margin:0 0 12px">Your OneVibe verification code:</p>
      <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:0.12em">${code}</p>
      <p style="margin:0;color:#6b7280;font-size:14px">This code expires in 10 minutes. If you did not request a ${label}, you can ignore this email.</p>
    </div>
  `;
  await sendMail({ to, subject, text, html });
}
