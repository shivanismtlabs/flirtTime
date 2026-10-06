import { NotFoundError } from '../../shared/errors/index.js';
import { sendMail } from '../../shared/email/index.js';
import { HelpRepository } from './help.repository.js';
import {
  HELP_REQUEST_OPTIONS,
  type CreateHelpRequestInput,
  type HelpRequest,
  type HelpRequestOption,
  type HelpRequestsPage,
  type UpdateHelpRequestInput,
} from './help.types.js';

function supportInbox(): string {
  return process.env.SUPPORT_EMAIL?.trim() || 'support@onevibe.ai';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class HelpService {
  constructor(private readonly repo = new HelpRepository()) {}

  getOptions(): HelpRequestOption[] {
    return HELP_REQUEST_OPTIONS;
  }

  private async requireUserId(actorUuid: string): Promise<string> {
    const userId = await this.repo.findUserIdByUuid(actorUuid);
    if (!userId) throw new NotFoundError('User not found');
    return userId;
  }

  async create(
    actorUuid: string,
    input: CreateHelpRequestInput,
  ): Promise<HelpRequest> {
    const userId = await this.requireUserId(actorUuid);
    const help = await this.repo.create(userId, input);
    void this.notifyEmails(help).catch(() => {
      // never fail create on email errors
    });
    return help;
  }

  async listMine(
    actorUuid: string,
    page: number,
    limit: number,
  ): Promise<HelpRequestsPage> {
    const userId = await this.requireUserId(actorUuid);
    return this.repo.listForUser(userId, page, limit);
  }

  async getMine(actorUuid: string, helpUuid: string): Promise<HelpRequest> {
    const userId = await this.requireUserId(actorUuid);
    const help = await this.repo.findOwnedByUuid(helpUuid, userId);
    if (!help) throw new NotFoundError('Help request not found');
    return help;
  }

  async updateMine(
    actorUuid: string,
    helpUuid: string,
    input: UpdateHelpRequestInput,
  ): Promise<HelpRequest> {
    const userId = await this.requireUserId(actorUuid);
    const help = await this.repo.updateOwned(helpUuid, userId, input);
    if (!help) throw new NotFoundError('Help request not found');
    return help;
  }

  async deleteMine(actorUuid: string, helpUuid: string): Promise<void> {
    const userId = await this.requireUserId(actorUuid);
    const ok = await this.repo.softDeleteOwned(helpUuid, userId);
    if (!ok) throw new NotFoundError('Help request not found');
  }

  private async notifyEmails(help: HelpRequest): Promise<void> {
    const adminText =
      `Notification: New Support Request\n\n` +
      `Dear Admin Team,\n\n` +
      `A new support request has been submitted through the application.\n\n` +
      `User Information:\n- Name: ${help.name}\n- Email: ${help.email}\n- Mobile: ${help.mobile}\n\n` +
      `Request Details:\n- Category: ${help.type}\n- Message:\n${help.description}\n\n` +
      `Please address this inquiry as soon as possible.\n\n` +
      `Regards,\noneVibe Platform System`;

    const adminHtml = `
<div style="background-color:#f8fafc;padding:40px 0;font-family:Helvetica,Arial,sans-serif;color:#334155">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="height:6px;background:#ff7a00"></div>
    <div style="padding:32px">
      <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#64748b">Internal Notification</p>
      <h2 style="margin:8px 0 0;font-size:24px;font-weight:700;color:#0f172a">New Support Inquiry</h2>
    </div>
    <div style="padding:0 32px 32px">
      <div style="background:#f1f5f9;padding:20px;border-radius:6px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#475569">Requester Details</p>
        <p style="margin:0;font-size:14px;line-height:1.5">
          <strong>Name:</strong> ${escapeHtml(help.name)}<br>
          <strong>Email:</strong> ${escapeHtml(help.email)}<br>
          <strong>Mobile:</strong> ${escapeHtml(help.mobile)}
        </p>
      </div>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#475569">Request Overview</p>
      <p style="margin:0 0 16px;font-size:14px"><strong>Category:</strong> ${escapeHtml(String(help.type))}</p>
      <p style="margin:24px 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;color:#475569">User Message</p>
      <div style="background:#fff7ed;border-left:4px solid #ff7a00;padding:16px;font-size:14px;line-height:1.6;color:#431407;white-space:pre-wrap">${escapeHtml(help.description)}</div>
    </div>
  </div>
</div>`;

    await sendMail({
      to: supportInbox(),
      subject: `New Help Request - ${help.type}`,
      text: adminText,
      html: adminHtml,
    }).catch(() => undefined);

    const userText =
      `Dear ${help.name},\n\n` +
      `Thank you for contacting oneVibe Support. We have successfully received your request regarding "${help.type}".\n\n` +
      `Summary of your message:\n"${help.description}"\n\n` +
      `Our support team is currently reviewing your ticket and will provide a response as soon as possible.\n\n` +
      `Best regards,\nThe oneVibe Support Team\n\n` +
      `---\nNote: This is an automated notification. Please do not reply directly to this email.`;

    await sendMail({
      to: help.email,
      subject: `Confirmation: Your Help Request Received - ${help.type}`,
      text: userText,
    }).catch(() => undefined);
  }
}
