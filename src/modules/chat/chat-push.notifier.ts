import { resolveConversationLiveState } from '../../shared/chat/index.js';
import {
  chatMediaLabel,
  groupIdsByLang,
  t,
} from '../notification/notification.i18n.js';
import { NotificationRepository } from '../notification/notification.repository.js';
import { PushService } from '../notification/push.service.js';
import type { ChatMessage } from './chat.types.js';
import { ChatRepository } from './chat.repository.js';

const PREVIEW_MAX = 120;

function messagePreview(message: ChatMessage, lang: string): string {
  switch (message.type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'voice':
    case 'file':
      return chatMediaLabel(lang, message.type) ?? t(lang, 'CHAT_NEW');
    case 'call':
      return (message.body ?? '').trim() || t(lang, 'CHAT_CALL');
    case 'system':
      return (message.body ?? '').trim() || t(lang, 'CHAT_GROUP_UPDATE');
    case 'poll':
      return message.poll?.question
        ? `📊 ${message.poll.question}`
        : t(lang, 'CHAT_POLL');
    case 'location':
      return message.location?.address
        ? `📍 ${message.location.address}`
        : t(lang, 'CHAT_LOCATION');
    case 'post':
    case 'reel': {
      const author = message.sharedPost?.author?.username;
      const caption = (message.sharedPost?.caption ?? message.body ?? '')
        .trim()
        .replace(/\s+/g, ' ');
      if (author && caption) return `📎 @${author}: ${caption}`;
      if (author) return `📎 @${author}`;
      return caption ? `📎 ${caption}` : t(lang, 'CHAT_POST');
    }
    default: {
      const body = (message.body ?? '').trim().replace(/\s+/g, ' ');
      if (!body) return t(lang, 'CHAT_NEW');
      return body.length > PREVIEW_MAX
        ? `${body.slice(0, PREVIEW_MAX - 1)}…`
        : body;
    }
  }
}

/**
 * FCM for new chat messages — not in-app notification rows.
 * Skips muted + actively viewing recipients; uses per-conversation tag.
 */
export class ChatPushNotifier {
  constructor(
    private readonly repo = new ChatRepository(),
    private readonly push = new PushService(),
    private readonly notifications = new NotificationRepository(),
  ) {}

  async notifyNewMessage(input: {
    conversationInternalId: string;
    recipientUuids: string[];
    message: ChatMessage;
    senderUuid: string;
  }): Promise<void> {
    const { conversationInternalId, message, senderUuid } = input;
    if (!input.recipientUuids.length) return;
    // Group system lines stay in-thread only (no FCM noise).
    if (message.type === 'system') return;

    const [muted, meta, sender] = await Promise.all([
      this.repo.listMutedParticipantUuids(conversationInternalId),
      this.repo.findConversationMeta(message.conversationId),
      this.repo.findUserDisplayByUuid(senderUuid),
    ]);

    const mutedSet = new Set(muted);
    const senderName =
      sender?.fullName?.trim() || sender?.username || '';
    const isGroup = meta?.type === 'group';
    const tag = `chat-${message.conversationId}`;
    const link = `/conversations/${message.conversationId}`;

    const live = await resolveConversationLiveState(
      message.conversationId,
      input.recipientUuids,
    );

    const eligible: string[] = [];
    for (const uuid of input.recipientUuids) {
      if (mutedSet.has(uuid)) continue;
      if (live.viewing.has(uuid)) continue;
      eligible.push(uuid);
    }

    if (!eligible.length) return;

    const settingsMap =
      await this.notifications.getSettingsByUserUuids(eligible);
    const allowed: string[] = [];
    let previewOff = false;
    for (const uuid of eligible) {
      const settings =
        settingsMap.get(uuid) ??
        ({
          notification: true,
          newChatMessage: true,
          msgShowNotifications: true,
          groupShowNotifications: true,
          showPreview: true,
        } as const);
      if (!settings.notification) continue;
      if (isGroup) {
        if (!settings.groupShowNotifications) continue;
      } else if (!settings.newChatMessage || !settings.msgShowNotifications) {
        continue;
      }
      if (!settings.showPreview) previewOff = true;
      allowed.push(uuid);
    }

    if (!allowed.length) return;

    const langByUuid =
      await this.notifications.getPreferredLangsByUuids(allowed);
    const groups = groupIdsByLang(allowed, langByUuid);
    const metaPayload = {
      conversationId: message.conversationId,
      messageId: message.id,
      senderId: senderUuid,
      chatType: meta?.type ?? 'direct',
    };

    const jobs: Array<Promise<unknown>> = [];
    for (const [lang, uuids] of groups) {
      const displayName = senderName || t(lang, 'SOMEONE');
      const preview = messagePreview(message, lang);
      const title = isGroup
        ? meta?.title?.trim() || t(lang, 'GROUP')
        : displayName;
      const body = isGroup ? `${displayName}: ${preview}` : preview;
      const hiddenBody = isGroup
        ? t(lang, 'CHAT_SENT', { user: displayName })
        : t(lang, 'CHAT_HIDDEN');

      const withPreview: string[] = [];
      const withoutPreview: string[] = [];
      if (previewOff) {
        for (const uuid of uuids) {
          const settings = settingsMap.get(uuid);
          if (settings && settings.showPreview === false) {
            withoutPreview.push(uuid);
          } else {
            withPreview.push(uuid);
          }
        }
      } else {
        withPreview.push(...uuids);
      }

      if (withPreview.length) {
        jobs.push(
          this.push.sendToUserUuids(withPreview, {
            title,
            body,
            type: 'message',
            tag,
            threadId: tag,
            link,
            meta: metaPayload,
          }),
        );
      }
      if (withoutPreview.length) {
        jobs.push(
          this.push.sendToUserUuids(withoutPreview, {
            title,
            body: hiddenBody,
            type: 'message',
            tag,
            threadId: tag,
            link,
            meta: metaPayload,
          }),
        );
      }
    }

    await Promise.all(jobs);
  }
}
