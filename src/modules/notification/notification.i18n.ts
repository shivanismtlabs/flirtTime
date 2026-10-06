import { resolveTextLang } from '../language/language.types.js';

export type NotificationI18nParams = Record<string, string>;

export type NotificationCopyKey =
  | 'LIKE'
  | 'LIKE_COMMENT'
  | 'COMMENT'
  | 'REPLY'
  | 'MENTION_TAG'
  | 'MENTION_COMMENT'
  | 'FOLLOW'
  | 'FOLLOW_REQUEST'
  | 'FOLLOW_ACCEPTED'
  | 'SHARE'
  | 'SHARE_OWNER'
  | 'SAVE'
  | 'GIFT'
  | 'POLL_VOTE'
  | 'NEW_CONTENT'
  | 'COIN_RECEIVED'
  | 'COIN_SENT'
  | 'PROFILE_VISIT'
  | 'WELCOME'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED';

type ContentKind = 'post' | 'reel' | 'vibe' | 'story';

const CONTENT_KEYS: Record<ContentKind, string> = {
  post: 'CONTENT_POST',
  reel: 'CONTENT_REEL',
  vibe: 'CONTENT_VIBE',
  story: 'CONTENT_STORY',
};

const CHANNEL_KEYS: Record<string, string> = {
  dm: 'CHANNEL_DM',
  story: 'CHANNEL_STORY',
  copy_link: 'CHANNEL_LINK',
};

const COPY: Record<NotificationCopyKey, { title: string; body: string }> = {
  LIKE: { title: 'LIKE_TITLE', body: 'LIKE_BODY' },
  LIKE_COMMENT: { title: 'LIKE_COMMENT_TITLE', body: 'LIKE_COMMENT_BODY' },
  COMMENT: { title: 'COMMENT_TITLE', body: 'COMMENT_BODY' },
  REPLY: { title: 'REPLY_TITLE', body: 'REPLY_BODY' },
  MENTION_TAG: { title: 'MENTION_TAG_TITLE', body: 'MENTION_TAG_BODY' },
  MENTION_COMMENT: { title: 'MENTION_COMMENT_TITLE', body: 'MENTION_COMMENT_BODY' },
  FOLLOW: { title: 'FOLLOW_TITLE', body: 'FOLLOW_BODY' },
  FOLLOW_REQUEST: { title: 'FOLLOW_REQUEST_TITLE', body: 'FOLLOW_REQUEST_BODY' },
  FOLLOW_ACCEPTED: { title: 'FOLLOW_ACCEPTED_TITLE', body: 'FOLLOW_ACCEPTED_BODY' },
  SHARE: { title: 'SHARE_TITLE', body: 'SHARE_BODY' },
  SHARE_OWNER: { title: 'SHARE_OWNER_TITLE', body: 'SHARE_OWNER_BODY' },
  SAVE: { title: 'SAVE_TITLE', body: 'SAVE_BODY' },
  GIFT: { title: 'GIFT_TITLE', body: 'GIFT_BODY' },
  POLL_VOTE: { title: 'POLL_VOTE_TITLE', body: 'POLL_VOTE_BODY' },
  NEW_CONTENT: { title: 'NEW_CONTENT_TITLE', body: 'NEW_CONTENT_BODY' },
  COIN_RECEIVED: { title: 'COIN_RECEIVED_TITLE', body: 'COIN_RECEIVED_BODY' },
  COIN_SENT: { title: 'COIN_SENT_TITLE', body: 'COIN_SENT_BODY' },
  PROFILE_VISIT: { title: 'PROFILE_VISIT_TITLE', body: 'PROFILE_VISIT_BODY' },
  WELCOME: { title: 'WELCOME_TITLE', body: 'WELCOME_BODY' },
  VERIFICATION_APPROVED: {
    title: 'VERIFICATION_APPROVED_TITLE',
    body: 'VERIFICATION_APPROVED_BODY',
  },
  VERIFICATION_REJECTED: {
    title: 'VERIFICATION_REJECTED_TITLE',
    body: 'VERIFICATION_REJECTED_BODY',
  },
};

const EN: Record<string, string> = {
  LIKE_TITLE: 'Liked',
  LIKE_BODY: '{user} liked your {content}',
  LIKE_COMMENT_TITLE: 'Liked comment',
  LIKE_COMMENT_BODY: '{user} liked your comment',
  COMMENT_TITLE: 'Comment',
  COMMENT_POST_TITLE: 'Comment on Post',
  COMMENT_REEL_TITLE: 'Comment on Reel',
  COMMENT_VIBE_TITLE: 'Comment on Vibe',
  COMMENT_BODY: '{user} commented {comment}',
  COMMENT_BODY_EMPTY: '{user} commented on your {content}',
  REPLY_TITLE: 'Reply on comment',
  REPLY_BODY: '{user} commented {comment} in {owner} {content}',
  REPLY_BODY_EMPTY: '{user} replied to your comment',
  MENTION_TAG_TITLE: 'Tag',
  MENTION_TAG_BODY: '{user} tagged you',
  MENTION_COMMENT_TITLE: 'Mentioned You In Comment',
  MENTION_COMMENT_BODY: '{user} commented {comment}',
  MENTION_COMMENT_BODY_EMPTY: '{user} mentioned you in a comment',
  FOLLOW_TITLE: 'Following',
  FOLLOW_BODY: '{user} started following you',
  FOLLOW_REQUEST_TITLE: 'Follow Request',
  FOLLOW_REQUEST_BODY: '{user} requested to follow you',
  FOLLOW_ACCEPTED_TITLE: 'Accepted Request',
  FOLLOW_ACCEPTED_BODY: '{user} accepted your friend request',
  UNFOLLOW_TITLE: 'Unfollow',
  UNFOLLOW_BODY: '{user} unfollowed you',
  REMOVED_FOLLOWER_TITLE: 'Removed from followers',
  REMOVED_FOLLOWER_BODY: '{user} removed you from their followers',
  DISLIKE_TITLE: 'Not interested',
  DISLIKE_BODY: '{user} not interested in your {content}',
  SHARE_TITLE: 'Share',
  SHARE_BODY: '{user} shared a {content} with you',
  SHARE_OWNER_TITLE: 'Share',
  SHARE_OWNER_BODY: '{user} shared your {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} shared your {content} {channel}',
  SAVE_TITLE: 'Saved',
  SAVE_BODY: '{user} saved your {content}',
  GIFT_TITLE: 'Gift 🎁',
  GIFT_BODY: '{user} sent you a {gift}',
  POLL_VOTE_TITLE: 'Poll vote',
  POLL_VOTE_BODY: '{user} voted on your poll',
  NEW_CONTENT_TITLE: 'New {content}',
  NEW_CONTENT_BODY: '{user} shared a new {content}',
  COIN_RECEIVED_TITLE: 'Coin Received',
  COIN_RECEIVED_BODY: '{user} sent you {amount} coins',
  COIN_SENT_TITLE: 'Coins sent',
  COIN_SENT_BODY: 'You sent {amount} coins to {user}',
  PROFILE_VISIT_TITLE: 'Profile visit',
  PROFILE_VISIT_BODY: '{user} viewed your profile',
  WELCOME_TITLE: 'Welcome to OneVibe',
  WELCOME_BODY:
    'Hi {user}! Your account is ready — start exploring and connect with people.',
  VERIFICATION_APPROVED_TITLE: 'Account verified',
  VERIFICATION_APPROVED_BODY:
    'Your account has been verified. You now have a blue tick.',
  VERIFICATION_REJECTED_TITLE: 'Verification update',
  VERIFICATION_REJECTED_BODY: 'Your verification request was not approved.',
  CONTENT_POST: 'post',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'story',
  CHANNEL_DM: 'in a chat',
  CHANNEL_STORY: 'to their story',
  CHANNEL_LINK: 'via link',
  SOMEONE: 'Someone',
  GROUP: 'Group',
  CHAT_PHOTO: '📷 Photo',
  CHAT_VIDEO: '🎥 Video',
  CHAT_AUDIO: '🎵 Audio',
  CHAT_VOICE: '🎤 Voice message',
  CHAT_FILE: '📁 File',
  CHAT_POLL: '📊 Poll',
  CHAT_LOCATION: '📍 Location',
  CHAT_POST: '📎 Post',
  CHAT_CALL: '📞 Call',
  CHAT_GROUP_UPDATE: 'Group update',
  CHAT_NEW: 'New message',
  CHAT_HIDDEN: 'New message',
  CHAT_SENT: '{user} sent a message',
  HIDDEN_PUSH: 'New notification',
  CALL_VOICE: 'Incoming voice call',
  CALL_VIDEO: 'Incoming video call',
  CALL_GROUP_VOICE: '{user} started a voice call',
  CALL_GROUP_VIDEO: '{user} started a video call',
};

const HI: Record<string, string> = {
  LIKE_TITLE: 'पसंद',
  LIKE_BODY: '{user} ने आपकी {content} पसंद की',
  LIKE_COMMENT_TITLE: 'टिप्पणी पसंद',
  LIKE_COMMENT_BODY: '{user} ने आपकी टिप्पणी पसंद की',
  COMMENT_TITLE: 'टिप्पणी',
  COMMENT_BODY: '{user} ने टिप्पणी की: {comment}',
  COMMENT_BODY_EMPTY: '{user} ने आपकी {content} पर टिप्पणी की',
  REPLY_TITLE: 'जवाब',
  REPLY_BODY: '{user} ने जवाब दिया: {comment}',
  REPLY_BODY_EMPTY: '{user} ने आपकी टिप्पणी का जवाब दिया',
  MENTION_TAG_TITLE: 'टैग',
  MENTION_TAG_BODY: '{user} ने आपको टैग किया',
  MENTION_COMMENT_TITLE: 'टिप्पणी में उल्लेख',
  MENTION_COMMENT_BODY: '{user} ने टिप्पणी की {comment}',
  FOLLOW_TITLE: 'फ़ॉलो',
  FOLLOW_BODY: '{user} ने आपको फ़ॉलो करना शुरू किया',
  FOLLOW_REQUEST_TITLE: 'फ़ॉलो अनुरोध',
  FOLLOW_REQUEST_BODY: '{user} ने आपको फ़ॉलो करने का अनुरोध किया',
  FOLLOW_ACCEPTED_TITLE: 'अनुरोध स्वीकार',
  FOLLOW_ACCEPTED_BODY: '{user} ने आपका फ़ॉलो अनुरोध स्वीकार किया',
  SHARE_TITLE: 'शेयर',
  SHARE_BODY: '{user} ने आपके साथ एक {content} शेयर की',
  SHARE_OWNER_TITLE: 'शेयर',
  SHARE_OWNER_BODY: '{user} ने आपकी {content} शेयर की',
  SHARE_OWNER_CHANNEL_BODY: '{user} ने आपकी {content} {channel} शेयर की',
  SAVE_TITLE: 'सेव',
  SAVE_BODY: '{user} ने आपकी {content} सेव की',
  GIFT_TITLE: 'उपहार मिला',
  GIFT_BODY: '{user} ने आपको {gift} भेजा',
  POLL_VOTE_TITLE: 'पोल वोट',
  POLL_VOTE_BODY: '{user} ने आपके पोल पर वोट किया',
  NEW_CONTENT_TITLE: 'नई {content}',
  NEW_CONTENT_BODY: '{user} ने एक नई {content} शेयर की',
  COIN_RECEIVED_TITLE: 'सिक्के मिले',
  COIN_RECEIVED_BODY: '{user} ने आपको {amount} सिक्के भेजे',
  COIN_SENT_TITLE: 'सिक्के भेजे',
  COIN_SENT_BODY: 'आपने {user} को {amount} सिक्के भेजे',
  CONTENT_POST: 'पोस्ट',
  CONTENT_REEL: 'रील',
  CONTENT_VIBE: 'वाइब',
  CONTENT_STORY: 'स्टोरी',
  CHANNEL_DM: 'चैट में',
  CHANNEL_STORY: 'अपनी स्टोरी पर',
  CHANNEL_LINK: 'लिंक से',
  SOMEONE: 'कोई',
  GROUP: 'ग्रुप',
  CHAT_PHOTO: '📷 फ़ोटो',
  CHAT_VIDEO: '🎥 वीडियो',
  CHAT_AUDIO: '🎵 ऑडियो',
  CHAT_VOICE: '🎤 वॉइस मैसेज',
  CHAT_FILE: '📁 फ़ाइल',
  CHAT_POLL: '📊 पोल',
  CHAT_LOCATION: '📍 लोकेशन',
  CHAT_POST: '📎 पोस्ट',
  CHAT_CALL: '📞 कॉल',
  CHAT_GROUP_UPDATE: 'ग्रुप अपडेट',
  CHAT_NEW: 'नया संदेश',
  CHAT_HIDDEN: 'नया संदेश',
  CHAT_SENT: '{user} ने एक संदेश भेजा',
  HIDDEN_PUSH: 'नई सूचना',
  CALL_VOICE: 'इनकमिंग वॉइस कॉल',
  CALL_VIDEO: 'इनकमिंग वीडियो कॉल',
  CALL_GROUP_VOICE: '{user} ने वॉइस कॉल शुरू की',
  CALL_GROUP_VIDEO: '{user} ने वीडियो कॉल शुरू की',
};

const RU: Record<string, string> = {
  LIKE_TITLE: 'Понравилось',
  LIKE_BODY: '{user} понравился ваш {content}',
  LIKE_COMMENT_TITLE: 'Понравился комментарий',
  LIKE_COMMENT_BODY: 'Ваш комментарий понравился {user}',
  COMMENT_TITLE: 'Комментарий',
  COMMENT_BODY: '{user} прокомментировал: {comment}',
  COMMENT_BODY_EMPTY: '{user} прокомментировал ваш {content}',
  REPLY_TITLE: 'Ответ на комментарий',
  REPLY_BODY: '{user} ответил: {comment}',
  REPLY_BODY_EMPTY: '{user} ответил на ваш комментарий',
  MENTION_TAG_TITLE: 'Отметка',
  MENTION_TAG_BODY: '{user} отметил вас в {content}',
  MENTION_COMMENT_TITLE: 'Упоминание в комментарии',
  MENTION_COMMENT_BODY: '{user} упомянул вас в комментарии',
  FOLLOW_TITLE: 'Подписка',
  FOLLOW_BODY: '{user} подписался на вас',
  FOLLOW_REQUEST_TITLE: 'Запрос на подписку',
  FOLLOW_REQUEST_BODY: '{user} запросил подписку на вас',
  FOLLOW_ACCEPTED_TITLE: 'Запрос принят',
  FOLLOW_ACCEPTED_BODY: '{user} принял ваш запрос',
  SHARE_TITLE: 'Поделиться',
  SHARE_BODY: '{user} поделился {content} с вами',
  SHARE_OWNER_TITLE: 'Поделиться',
  SHARE_OWNER_BODY: '{user} поделился вашим {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} поделился вашим {content} {channel}',
  SAVE_TITLE: 'Сохранено',
  SAVE_BODY: '{user} сохранил ваш {content}',
  GIFT_TITLE: 'Подарок 🎁',
  GIFT_BODY: '{user} отправил вам {gift}',
  POLL_VOTE_TITLE: 'Голос в опросе',
  POLL_VOTE_BODY: '{user} проголосовал(а) в вашем опросе',
  NEW_CONTENT_TITLE: 'Новый {content}',
  NEW_CONTENT_BODY: '{user} поделился новым {content}',
  COIN_RECEIVED_TITLE: 'Получены монеты',
  COIN_RECEIVED_BODY: '{user} отправил вам {amount} монет',
  COIN_SENT_TITLE: 'Монеты отправлены',
  COIN_SENT_BODY: 'Вы отправили {amount} монет пользователю {user}',
  CONTENT_POST: 'пост',
  CONTENT_REEL: 'ролик',
  CONTENT_VIBE: 'вайб',
  CONTENT_STORY: 'история',
  CHANNEL_DM: 'в чате',
  CHANNEL_STORY: 'в свою историю',
  CHANNEL_LINK: 'по ссылке',
  SOMEONE: 'Кто-то',
  GROUP: 'Группа',
  CHAT_NEW: 'Новое сообщение',
  CHAT_HIDDEN: 'Новое сообщение',
  CHAT_SENT: '{user} отправил сообщение',
  CALL_VOICE: 'Входящий голосовой вызов',
  CALL_VIDEO: 'Входящий видеовызов',
  CALL_GROUP_VOICE: '{user} начал голосовой вызов',
  CALL_GROUP_VIDEO: '{user} начал видеовызов',
};

const UK: Record<string, string> = {
  LIKE_TITLE: 'Вподобано',
  LIKE_BODY: '{user} вподобав ваш {content}',
  LIKE_COMMENT_TITLE: 'Коментар сподобався',
  LIKE_COMMENT_BODY: '{user} вподобав ваш коментар',
  COMMENT_TITLE: 'Коментар',
  COMMENT_BODY: '{user} прокоментував: {comment}',
  COMMENT_BODY_EMPTY: '{user} прокоментував ваш {content}',
  REPLY_TITLE: 'Відповідь на коментар',
  REPLY_BODY: '{user} відповів: {comment}',
  REPLY_BODY_EMPTY: '{user} відповів на ваш коментар',
  MENTION_TAG_TITLE: 'Позначення',
  MENTION_TAG_BODY: '{user} позначив вас у {content}',
  MENTION_COMMENT_TITLE: 'Згадування в коментарі',
  MENTION_COMMENT_BODY: '{user} згадав вас у коментарі',
  FOLLOW_TITLE: 'Підписка',
  FOLLOW_BODY: '{user} почав стежити за вами',
  FOLLOW_REQUEST_TITLE: 'Запит на підписку',
  FOLLOW_REQUEST_BODY: '{user} надіслав запит на підписку',
  FOLLOW_ACCEPTED_TITLE: 'Запит прийнято',
  FOLLOW_ACCEPTED_BODY: '{user} прийняв ваш запит',
  SHARE_TITLE: 'Поширення',
  SHARE_BODY: '{user} поширив {content} з вами',
  SHARE_OWNER_TITLE: 'Поширення',
  SHARE_OWNER_BODY: '{user} поширив ваш {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} поширив ваш {content} {channel}',
  SAVE_TITLE: 'Збережено',
  SAVE_BODY: '{user} зберіг ваш {content}',
  GIFT_TITLE: 'Подарунок 🎁',
  GIFT_BODY: '{user} надіслав вам {gift}',
  POLL_VOTE_TITLE: 'Голос в опитуванні',
  POLL_VOTE_BODY: '{user} проголосував у вашому опитуванні',
  NEW_CONTENT_TITLE: 'Новий {content}',
  NEW_CONTENT_BODY: '{user} поділився новим {content}',
  COIN_RECEIVED_TITLE: 'Отримано монети',
  COIN_RECEIVED_BODY: '{user} надіслав вам {amount} монет',
  COIN_SENT_TITLE: 'Монети надіслано',
  COIN_SENT_BODY: 'Ви надіслали {amount} монет користувачу {user}',
  CONTENT_POST: 'допис',
  CONTENT_REEL: 'ролик',
  CONTENT_VIBE: 'вайб',
  CONTENT_STORY: 'історія',
  CHANNEL_DM: 'у чаті',
  CHANNEL_STORY: 'у свою історію',
  CHANNEL_LINK: 'за посиланням',
  SOMEONE: 'Хтось',
  GROUP: 'Група',
  CHAT_NEW: 'Нове повідомлення',
  CHAT_HIDDEN: 'Нове повідомлення',
  CHAT_SENT: '{user} надіслав повідомлення',
  CALL_VOICE: 'Вхідний голосовий виклик',
  CALL_VIDEO: 'Вхідний відеовиклик',
  CALL_GROUP_VOICE: '{user} почав голосовий виклик',
  CALL_GROUP_VIDEO: '{user} почав відеовиклик',
};

const PL: Record<string, string> = {
  LIKE_TITLE: 'Polubiono',
  LIKE_BODY: '{user} polubił(a) Twój {content}',
  LIKE_COMMENT_TITLE: 'Polubiono komentarz',
  LIKE_COMMENT_BODY: '{user} polubił Twój komentarz',
  COMMENT_TITLE: 'Komentarz',
  COMMENT_BODY: '{user} skomentował(a): {comment}',
  COMMENT_BODY_EMPTY: '{user} skomentował(a) Twój {content}',
  REPLY_TITLE: 'Odpowiedź na komentarz',
  REPLY_BODY: '{user} odpowiedział(a): {comment}',
  REPLY_BODY_EMPTY: '{user} odpowiedział(a) na Twój komentarz',
  MENTION_TAG_TITLE: 'Oznaczenie',
  MENTION_TAG_BODY: '{user} oznaczył(a) Cię w {content}',
  MENTION_COMMENT_TITLE: 'Wzmianka w komentarzu',
  MENTION_COMMENT_BODY: '{user} wspomniał(a) o Tobie w komentarzu',
  FOLLOW_TITLE: 'Obserwowanie',
  FOLLOW_BODY: '{user} zaczął cię obserwować',
  FOLLOW_REQUEST_TITLE: 'Prośba o obserwowanie',
  FOLLOW_REQUEST_BODY: '{user} poprosił o obserwowanie',
  FOLLOW_ACCEPTED_TITLE: 'Prośba zaakceptowana',
  FOLLOW_ACCEPTED_BODY: '{user} zaakceptował twoją prośbę',
  SHARE_TITLE: 'Udostępnienie',
  SHARE_BODY: '{user} udostępnił(a) Ci {content}',
  SHARE_OWNER_TITLE: 'Udostępnienie',
  SHARE_OWNER_BODY: '{user} udostępnił(a) Twój {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} udostępnił(a) Twój {content} {channel}',
  SAVE_TITLE: 'Zapisano',
  SAVE_BODY: '{user} zapisał(a) Twój {content}',
  GIFT_TITLE: 'Prezent 🎁',
  GIFT_BODY: '{user} wysłał(a) Ci {gift}',
  POLL_VOTE_TITLE: 'Głos w ankiecie',
  POLL_VOTE_BODY: '{user} zagłosował(a) w Twojej ankiecie',
  NEW_CONTENT_TITLE: 'Nowy {content}',
  NEW_CONTENT_BODY: '{user} udostępnił nowy {content}',
  COIN_RECEIVED_TITLE: 'Otrzymano monety',
  COIN_RECEIVED_BODY: '{user} wysłał(a) Ci {amount} monet',
  COIN_SENT_TITLE: 'Wysłano monety',
  COIN_SENT_BODY: 'Wysłałeś {amount} monet do {user}',
  CONTENT_POST: 'post',
  CONTENT_REEL: 'film',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'relacja',
  CHANNEL_DM: 'w czacie',
  CHANNEL_STORY: 'w swojej relacji',
  CHANNEL_LINK: 'przez link',
  SOMEONE: 'Ktoś',
  GROUP: 'Grupa',
  CHAT_NEW: 'Nowa wiadomość',
  CHAT_HIDDEN: 'Nowa wiadomość',
  CHAT_SENT: '{user} wysłał wiadomość',
  CALL_VOICE: 'Przychodzące połączenie głosowe',
  CALL_VIDEO: 'Przychodzące połączenie wideo',
  CALL_GROUP_VOICE: '{user} rozpoczął połączenie głosowe',
  CALL_GROUP_VIDEO: '{user} rozpoczął połączenie wideo',
};

const ZH: Record<string, string> = {
  LIKE_TITLE: '点赞',
  LIKE_BODY: '{user} 点赞了你的 {content}',
  LIKE_COMMENT_TITLE: '评论被点赞',
  LIKE_COMMENT_BODY: '{user} 点赞了你的评论',
  COMMENT_TITLE: '评论',
  COMMENT_BODY: '{user} 评论了：{comment}',
  COMMENT_BODY_EMPTY: '{user} 评论了你的 {content}',
  REPLY_TITLE: '回复评论',
  REPLY_BODY: '{user} 回复了：{comment}',
  REPLY_BODY_EMPTY: '{user} 回复了你的评论',
  MENTION_TAG_TITLE: '标记',
  MENTION_TAG_BODY: '{user} 在 {content} 中标记了你',
  MENTION_COMMENT_TITLE: '评论中提到你',
  MENTION_COMMENT_BODY: '{user} 在评论中提到了你',
  FOLLOW_TITLE: '新的关注',
  FOLLOW_BODY: '{user} 开始关注你',
  FOLLOW_REQUEST_TITLE: '关注请求',
  FOLLOW_REQUEST_BODY: '{user} 请求关注你',
  FOLLOW_ACCEPTED_TITLE: '请求已接受',
  FOLLOW_ACCEPTED_BODY: '{user} 接受了你的请求',
  SHARE_TITLE: '分享',
  SHARE_BODY: '{user} 与你分享了一个 {content}',
  SHARE_OWNER_TITLE: '分享',
  SHARE_OWNER_BODY: '{user} 分享了你的 {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} {channel}分享了你的 {content}',
  SAVE_TITLE: '已保存',
  SAVE_BODY: '{user} 保存了你的 {content}',
  GIFT_TITLE: '礼物 🎁',
  GIFT_BODY: '{user} 给你送了 {gift}',
  POLL_VOTE_TITLE: '投票',
  POLL_VOTE_BODY: '{user} 在你的投票中投了一票',
  NEW_CONTENT_TITLE: '新的{content}',
  NEW_CONTENT_BODY: '{user} 分享了一个新的{content}',
  COIN_RECEIVED_TITLE: '收到金币',
  COIN_RECEIVED_BODY: '{user} 给你转了 {amount} 个金币',
  COIN_SENT_TITLE: '已发送金币',
  COIN_SENT_BODY: '你向 {user} 发送了 {amount} 个金币',
  CONTENT_POST: '帖子',
  CONTENT_REEL: '视频',
  CONTENT_VIBE: '氛围',
  CONTENT_STORY: '故事',
  CHANNEL_DM: '在聊天中',
  CHANNEL_STORY: '到他们的故事',
  CHANNEL_LINK: '通过链接',
  SOMEONE: '有人',
  GROUP: '群组',
  CHAT_NEW: '新消息',
  CHAT_HIDDEN: '新消息',
  CHAT_SENT: '{user} 发来一条消息',
  CALL_VOICE: '语音来电',
  CALL_VIDEO: '视频来电',
  CALL_GROUP_VOICE: '{user} 开始了语音通话',
  CALL_GROUP_VIDEO: '{user} 开始了视频通话',
};

const JA: Record<string, string> = {
  LIKE_TITLE: 'いいね',
  LIKE_BODY: '{user} があなたの {content} にいいねしました',
  LIKE_COMMENT_TITLE: 'コメントがいいねされました',
  LIKE_COMMENT_BODY: '{user} があなたのコメントにいいねしました',
  COMMENT_TITLE: 'コメント',
  COMMENT_BODY: '{user} がコメントしました: {comment}',
  COMMENT_BODY_EMPTY: '{user} があなたの {content} にコメントしました',
  REPLY_TITLE: 'コメントへの返信',
  REPLY_BODY: '{user} が返信しました: {comment}',
  REPLY_BODY_EMPTY: '{user} があなたのコメントに返信しました',
  MENTION_TAG_TITLE: 'タグ付け',
  MENTION_TAG_BODY: '{user} が {content} であなたをタグ付けしました',
  MENTION_COMMENT_TITLE: 'コメントでメンション',
  MENTION_COMMENT_BODY: '{user} がコメントであなたに言及しました',
  FOLLOW_TITLE: 'フォロー開始',
  FOLLOW_BODY: '{user} があなたをフォローしました',
  FOLLOW_REQUEST_TITLE: 'フォローリクエスト',
  FOLLOW_REQUEST_BODY: '{user} がフォローをリクエストしました',
  FOLLOW_ACCEPTED_TITLE: 'リクエスト承認',
  FOLLOW_ACCEPTED_BODY: '{user} がリクエストを承認しました',
  SHARE_TITLE: 'シェア',
  SHARE_BODY: '{user} があなたに {content} をシェアしました',
  SHARE_OWNER_TITLE: 'シェア',
  SHARE_OWNER_BODY: '{user} があなたの {content} をシェアしました',
  SHARE_OWNER_CHANNEL_BODY: '{user} があなたの {content} を {channel} シェアしました',
  SAVE_TITLE: '保存',
  SAVE_BODY: '{user} があなたの {content} を保存しました',
  GIFT_TITLE: 'ギフト 🎁',
  GIFT_BODY: '{user} があなたに {gift} を送りました',
  POLL_VOTE_TITLE: '投票',
  POLL_VOTE_BODY: '{user} があなたの投票に投票しました',
  NEW_CONTENT_TITLE: '新しい{content}',
  NEW_CONTENT_BODY: '{user} が新しい{content}を共有しました',
  COIN_RECEIVED_TITLE: 'コインを受け取りました',
  COIN_RECEIVED_BODY: '{user} があなたに {amount} コインを送りました',
  COIN_SENT_TITLE: 'コインを送信しました',
  COIN_SENT_BODY: '{user} に {amount} コインを送りました',
  CONTENT_POST: '投稿',
  CONTENT_REEL: 'リール',
  CONTENT_VIBE: 'バイブ',
  CONTENT_STORY: 'ストーリー',
  CHANNEL_DM: 'チャットで',
  CHANNEL_STORY: 'ストーリーへ',
  CHANNEL_LINK: 'リンクで',
  SOMEONE: 'だれか',
  GROUP: 'グループ',
  CHAT_NEW: '新しいメッセージ',
  CHAT_HIDDEN: '新しいメッセージ',
  CHAT_SENT: '{user} がメッセージを送りました',
  CALL_VOICE: '着信音声通話',
  CALL_VIDEO: '着信ビデオ通話',
  CALL_GROUP_VOICE: '{user} が音声通話を開始しました',
  CALL_GROUP_VIDEO: '{user} がビデオ通話を開始しました',
};

const TR: Record<string, string> = {
  LIKE_TITLE: 'Beğenildi',
  LIKE_BODY: '{user} {content} içeriğini beğendi',
  LIKE_COMMENT_TITLE: 'Yorum Beğenildi',
  LIKE_COMMENT_BODY: '{user} yorumunu beğendi',
  COMMENT_TITLE: 'Yorum',
  COMMENT_BODY: '{user} yorum yaptı: {comment}',
  COMMENT_BODY_EMPTY: '{user} {content} içeriğine yorum yaptı',
  REPLY_TITLE: 'Yoruma yanıt',
  REPLY_BODY: '{user} yanıtladı: {comment}',
  REPLY_BODY_EMPTY: '{user} yorumunu yanıtladı',
  MENTION_TAG_TITLE: 'Etiket',
  MENTION_TAG_BODY: '{user} seni bir {content} içinde etiketledi',
  MENTION_COMMENT_TITLE: 'Yorumda Bahsedildi',
  MENTION_COMMENT_BODY: '{user} bir yorumda senden bahsetti',
  FOLLOW_TITLE: 'Takip',
  FOLLOW_BODY: '{user} seni takip etmeye başladı',
  FOLLOW_REQUEST_TITLE: 'Takip İsteği',
  FOLLOW_REQUEST_BODY: '{user} seni takip etmek istiyor',
  FOLLOW_ACCEPTED_TITLE: 'İstek Kabul Edildi',
  FOLLOW_ACCEPTED_BODY: '{user} isteğini kabul etti',
  SHARE_TITLE: 'Paylaşım',
  SHARE_BODY: '{user} seninle bir {content} paylaştı',
  SHARE_OWNER_TITLE: 'Paylaşım',
  SHARE_OWNER_BODY: '{user} senin {content} içeriğini paylaştı',
  SHARE_OWNER_CHANNEL_BODY: '{user} senin {content} içeriğini {channel} paylaştı',
  SAVE_TITLE: 'Kaydedildi',
  SAVE_BODY: '{user} {content} içeriğini kaydetti',
  GIFT_TITLE: 'Hediye 🎁',
  GIFT_BODY: '{user} sana {gift} gönderdi',
  POLL_VOTE_TITLE: 'Anket oyu',
  POLL_VOTE_BODY: '{user} anketine oy verdi',
  NEW_CONTENT_TITLE: 'Yeni {content}',
  NEW_CONTENT_BODY: '{user} yeni bir {content} paylaştı',
  COIN_RECEIVED_TITLE: 'Coin Alındı',
  COIN_RECEIVED_BODY: '{user} sana {amount} coin gönderdi',
  COIN_SENT_TITLE: 'Coin gönderildi',
  COIN_SENT_BODY: '{user} kullanıcısına {amount} coin gönderdin',
  CONTENT_POST: 'gönderi',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'hikâye',
  CHANNEL_DM: 'sohbette',
  CHANNEL_STORY: 'hikâyesine',
  CHANNEL_LINK: 'bağlantıyla',
  SOMEONE: 'Birisi',
  GROUP: 'Grup',
  CHAT_NEW: 'Yeni mesaj',
  CHAT_HIDDEN: 'Yeni mesaj',
  CHAT_SENT: '{user} bir mesaj gönderdi',
  CALL_VOICE: 'Gelen sesli arama',
  CALL_VIDEO: 'Gelen görüntülü arama',
  CALL_GROUP_VOICE: '{user} sesli arama başlattı',
  CALL_GROUP_VIDEO: '{user} görüntülü arama başlattı',
};

const ES: Record<string, string> = {
  LIKE_TITLE: 'Me gusta',
  LIKE_BODY: '{user} le dio me gusta a tu {content}',
  LIKE_COMMENT_TITLE: 'Comentario con me gusta',
  LIKE_COMMENT_BODY: 'A {user} le gustó tu comentario',
  COMMENT_TITLE: 'Comentario',
  COMMENT_BODY: '{user} comentó: {comment}',
  COMMENT_BODY_EMPTY: '{user} comentó en tu {content}',
  REPLY_TITLE: 'Respuesta al comentario',
  REPLY_BODY: '{user} respondió: {comment}',
  REPLY_BODY_EMPTY: '{user} respondió a tu comentario',
  MENTION_TAG_TITLE: 'Etiqueta',
  MENTION_TAG_BODY: '{user} te etiquetó en un {content}',
  MENTION_COMMENT_TITLE: 'Mención en comentario',
  MENTION_COMMENT_BODY: '{user} te mencionó en un comentario',
  FOLLOW_TITLE: 'Siguiendo',
  FOLLOW_BODY: '{user} comenzó a seguirte',
  FOLLOW_REQUEST_TITLE: 'Solicitud de seguimiento',
  FOLLOW_REQUEST_BODY: '{user} solicitó seguirte',
  FOLLOW_ACCEPTED_TITLE: 'Solicitud aceptada',
  FOLLOW_ACCEPTED_BODY: '{user} aceptó tu solicitud',
  SHARE_TITLE: 'Compartir',
  SHARE_BODY: '{user} compartió un {content} contigo',
  SHARE_OWNER_TITLE: 'Compartir',
  SHARE_OWNER_BODY: '{user} compartió tu {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} compartió tu {content} {channel}',
  SAVE_TITLE: 'Guardado',
  SAVE_BODY: '{user} guardó tu {content}',
  GIFT_TITLE: 'Regalo 🎁',
  GIFT_BODY: '{user} te envió {gift}',
  POLL_VOTE_TITLE: 'Voto en encuesta',
  POLL_VOTE_BODY: '{user} votó en tu encuesta',
  NEW_CONTENT_TITLE: 'Nuevo {content}',
  NEW_CONTENT_BODY: '{user} compartió un nuevo {content}',
  COIN_RECEIVED_TITLE: 'Monedas recibidas',
  COIN_RECEIVED_BODY: '{user} te envió {amount} monedas',
  COIN_SENT_TITLE: 'Monedas enviadas',
  COIN_SENT_BODY: 'Enviaste {amount} monedas a {user}',
  CONTENT_POST: 'publicación',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'historia',
  CHANNEL_DM: 'en un chat',
  CHANNEL_STORY: 'en su historia',
  CHANNEL_LINK: 'por enlace',
  SOMEONE: 'Alguien',
  GROUP: 'Grupo',
  CHAT_NEW: 'Mensaje nuevo',
  CHAT_HIDDEN: 'Mensaje nuevo',
  CHAT_SENT: '{user} envió un mensaje',
  CALL_VOICE: 'Llamada de voz entrante',
  CALL_VIDEO: 'Videollamada entrante',
  CALL_GROUP_VOICE: '{user} inició una llamada de voz',
  CALL_GROUP_VIDEO: '{user} inició una videollamada',
};

const DE: Record<string, string> = {
  LIKE_TITLE: 'Gefällt mir',
  LIKE_BODY: '{user} hat deinen {content} geliked',
  LIKE_COMMENT_TITLE: 'Kommentar geliked',
  LIKE_COMMENT_BODY: '{user} hat deinen Kommentar geliked',
  COMMENT_TITLE: 'Kommentar',
  COMMENT_BODY: '{user} kommentierte: {comment}',
  COMMENT_BODY_EMPTY: '{user} hat deinen {content} kommentiert',
  REPLY_TITLE: 'Antwort auf Kommentar',
  REPLY_BODY: '{user} antwortete: {comment}',
  REPLY_BODY_EMPTY: '{user} hat auf deinen Kommentar geantwortet',
  MENTION_TAG_TITLE: 'Markierung',
  MENTION_TAG_BODY: '{user} hat dich in einem {content} markiert',
  MENTION_COMMENT_TITLE: 'Erwähnung im Kommentar',
  MENTION_COMMENT_BODY: '{user} hat dich in einem Kommentar erwähnt',
  FOLLOW_TITLE: 'Neuer Follower',
  FOLLOW_BODY: '{user} folgt dir jetzt',
  FOLLOW_REQUEST_TITLE: 'Follower-Anfrage',
  FOLLOW_REQUEST_BODY: '{user} möchte dir folgen',
  FOLLOW_ACCEPTED_TITLE: 'Anfrage angenommen',
  FOLLOW_ACCEPTED_BODY: '{user} hat deine Anfrage angenommen',
  SHARE_TITLE: 'Teilen',
  SHARE_BODY: '{user} hat einen {content} mit dir geteilt',
  SHARE_OWNER_TITLE: 'Teilen',
  SHARE_OWNER_BODY: '{user} hat deinen {content} geteilt',
  SHARE_OWNER_CHANNEL_BODY: '{user} hat deinen {content} {channel} geteilt',
  SAVE_TITLE: 'Gespeichert',
  SAVE_BODY: '{user} hat deinen {content} gespeichert',
  GIFT_TITLE: 'Geschenk 🎁',
  GIFT_BODY: '{user} hat dir {gift} gesendet',
  POLL_VOTE_TITLE: 'Umfrage-Stimme',
  POLL_VOTE_BODY: '{user} hat in deiner Umfrage abgestimmt',
  NEW_CONTENT_TITLE: 'Neuer {content}',
  NEW_CONTENT_BODY: '{user} hat einen neuen {content} geteilt',
  COIN_RECEIVED_TITLE: 'Münzen erhalten',
  COIN_RECEIVED_BODY: '{user} hat dir {amount} Münzen gesendet',
  COIN_SENT_TITLE: 'Münzen gesendet',
  COIN_SENT_BODY: 'Du hast {amount} Münzen an {user} gesendet',
  CONTENT_POST: 'Beitrag',
  CONTENT_REEL: 'Reel',
  CONTENT_VIBE: 'Vibe',
  CONTENT_STORY: 'Story',
  CHANNEL_DM: 'in einem Chat',
  CHANNEL_STORY: 'in ihrer Story',
  CHANNEL_LINK: 'per Link',
  SOMEONE: 'Jemand',
  GROUP: 'Gruppe',
  CHAT_NEW: 'Neue Nachricht',
  CHAT_HIDDEN: 'Neue Nachricht',
  CHAT_SENT: '{user} hat eine Nachricht gesendet',
  CALL_VOICE: 'Eingehender Sprachanruf',
  CALL_VIDEO: 'Eingehender Videoanruf',
  CALL_GROUP_VOICE: '{user} hat einen Sprachanruf gestartet',
  CALL_GROUP_VIDEO: '{user} hat einen Videoanruf gestartet',
};

const KO: Record<string, string> = {
  LIKE_TITLE: '좋아요',
  LIKE_BODY: '{user} 님이 회원님의 {content}을(를) 좋아합니다',
  LIKE_COMMENT_TITLE: '댓글 좋아요',
  LIKE_COMMENT_BODY: '{user}님이 회원님의 댓글을 좋아요 했습니다',
  COMMENT_TITLE: '댓글',
  COMMENT_BODY: '{user} 님이 댓글을 남겼습니다: {comment}',
  COMMENT_BODY_EMPTY: '{user} 님이 회원님의 {content}에 댓글을 남겼습니다',
  REPLY_TITLE: '댓글에 답글',
  REPLY_BODY: '{user} 님이 답글을 남겼습니다: {comment}',
  REPLY_BODY_EMPTY: '{user} 님이 회원님의 댓글에 답글을 남겼습니다',
  MENTION_TAG_TITLE: '태그',
  MENTION_TAG_BODY: '{user} 님이 {content}에서 회원님을 태그했습니다',
  MENTION_COMMENT_TITLE: '댓글에서 언급됨',
  MENTION_COMMENT_BODY: '{user} 님이 댓글에서 회원님을 언급했습니다',
  FOLLOW_TITLE: '팔로우',
  FOLLOW_BODY: '{user} 님이 팔로우했습니다',
  FOLLOW_REQUEST_TITLE: '팔로우 요청',
  FOLLOW_REQUEST_BODY: '{user} 님이 팔로우를 요청했습니다',
  FOLLOW_ACCEPTED_TITLE: '요청 수락',
  FOLLOW_ACCEPTED_BODY: '{user} 님이 요청을 수락했습니다',
  SHARE_TITLE: '공유',
  SHARE_BODY: '{user} 님이 {content}을(를) 공유했습니다',
  SHARE_OWNER_TITLE: '공유',
  SHARE_OWNER_BODY: '{user} 님이 회원님의 {content}을(를) 공유했습니다',
  SHARE_OWNER_CHANNEL_BODY: '{user} 님이 회원님의 {content}을(를) {channel} 공유했습니다',
  SAVE_TITLE: '저장됨',
  SAVE_BODY: '{user} 님이 회원님의 {content}을(를) 저장했습니다',
  GIFT_TITLE: '선물 🎁',
  GIFT_BODY: '{user} 님이 {gift}을(를) 보냈습니다',
  POLL_VOTE_TITLE: '투표',
  POLL_VOTE_BODY: '{user} 님이 회원님의 투표에 참여했습니다',
  NEW_CONTENT_TITLE: '새 {content}',
  NEW_CONTENT_BODY: '{user} 님이 새 {content}을(를) 공유했습니다',
  COIN_RECEIVED_TITLE: '코인 수신',
  COIN_RECEIVED_BODY: '{user} 님이 {amount} 코인을 보냈습니다',
  COIN_SENT_TITLE: '코인 전송',
  COIN_SENT_BODY: '{user} 님에게 {amount} 코인을 보냈습니다',
  CONTENT_POST: '게시물',
  CONTENT_REEL: '릴',
  CONTENT_VIBE: '바이브',
  CONTENT_STORY: '스토리',
  CHANNEL_DM: '채팅에서',
  CHANNEL_STORY: '스토리로',
  CHANNEL_LINK: '링크로',
  SOMEONE: '누군가',
  GROUP: '그룹',
  CHAT_NEW: '새 메시지',
  CHAT_HIDDEN: '새 메시지',
  CHAT_SENT: '{user} 님이 메시지를 보냈습니다',
  CALL_VOICE: '음성 통화 수신',
  CALL_VIDEO: '영상 통화 수신',
  CALL_GROUP_VOICE: '{user} 님이 음성 통화를 시작했습니다',
  CALL_GROUP_VIDEO: '{user} 님이 영상 통화를 시작했습니다',
};

const PT: Record<string, string> = {
  LIKE_TITLE: 'Curtida',
  LIKE_BODY: '{user} curtiu seu {content}',
  LIKE_COMMENT_TITLE: 'Comentário curtido',
  LIKE_COMMENT_BODY: '{user} curtiu seu comentário',
  COMMENT_TITLE: 'Comentário',
  COMMENT_BODY: '{user} comentou: {comment}',
  COMMENT_BODY_EMPTY: '{user} comentou no seu {content}',
  REPLY_TITLE: 'Resposta ao comentário',
  REPLY_BODY: '{user} respondeu: {comment}',
  REPLY_BODY_EMPTY: '{user} respondeu ao seu comentário',
  MENTION_TAG_TITLE: 'Marcação',
  MENTION_TAG_BODY: '{user} marcou você em um {content}',
  MENTION_COMMENT_TITLE: 'Menção em comentário',
  MENTION_COMMENT_BODY: '{user} mencionou você em um comentário',
  FOLLOW_TITLE: 'Seguindo',
  FOLLOW_BODY: '{user} começou a te seguir',
  FOLLOW_REQUEST_TITLE: 'Pedido de seguir',
  FOLLOW_REQUEST_BODY: '{user} pediu para te seguir',
  FOLLOW_ACCEPTED_TITLE: 'Pedido aceito',
  FOLLOW_ACCEPTED_BODY: '{user} aceitou seu pedido',
  SHARE_TITLE: 'Compartilhar',
  SHARE_BODY: '{user} compartilhou um {content} com você',
  SHARE_OWNER_TITLE: 'Compartilhar',
  SHARE_OWNER_BODY: '{user} compartilhou seu {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} compartilhou seu {content} {channel}',
  SAVE_TITLE: 'Salvo',
  SAVE_BODY: '{user} salvou seu {content}',
  GIFT_TITLE: 'Presente 🎁',
  GIFT_BODY: '{user} enviou {gift}',
  POLL_VOTE_TITLE: 'Voto na enquete',
  POLL_VOTE_BODY: '{user} votou na sua enquete',
  NEW_CONTENT_TITLE: 'Novo {content}',
  NEW_CONTENT_BODY: '{user} compartilhou um novo {content}',
  COIN_RECEIVED_TITLE: 'Moedas recebidas',
  COIN_RECEIVED_BODY: '{user} enviou {amount} moedas',
  COIN_SENT_TITLE: 'Moedas enviadas',
  COIN_SENT_BODY: 'Você enviou {amount} moedas para {user}',
  CONTENT_POST: 'publicação',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'story',
  CHANNEL_DM: 'em um chat',
  CHANNEL_STORY: 'no story',
  CHANNEL_LINK: 'por link',
  SOMEONE: 'Alguém',
  GROUP: 'Grupo',
  CHAT_NEW: 'Nova mensagem',
  CHAT_HIDDEN: 'Nova mensagem',
  CHAT_SENT: '{user} enviou uma mensagem',
  CALL_VOICE: 'Chamada de voz recebida',
  CALL_VIDEO: 'Chamada de vídeo recebida',
  CALL_GROUP_VOICE: '{user} iniciou uma chamada de voz',
  CALL_GROUP_VIDEO: '{user} iniciou uma chamada de vídeo',
};

const IT: Record<string, string> = {
  LIKE_TITLE: 'Mi piace',
  LIKE_BODY: '{user} ha messo mi piace al tuo {content}',
  LIKE_COMMENT_TITLE: 'Commento apprezzato',
  LIKE_COMMENT_BODY: '{user} ha messo mi piace al tuo commento',
  COMMENT_TITLE: 'Commento',
  COMMENT_BODY: '{user} ha commentato: {comment}',
  COMMENT_BODY_EMPTY: '{user} ha commentato il tuo {content}',
  REPLY_TITLE: 'Risposta al commento',
  REPLY_BODY: '{user} ha risposto: {comment}',
  REPLY_BODY_EMPTY: '{user} ha risposto al tuo commento',
  MENTION_TAG_TITLE: 'Tag',
  MENTION_TAG_BODY: '{user} ti ha taggato in un {content}',
  MENTION_COMMENT_TITLE: 'Menzione nel commento',
  MENTION_COMMENT_BODY: '{user} ti ha menzionato in un commento',
  FOLLOW_TITLE: 'Nuovo follower',
  FOLLOW_BODY: '{user} ha iniziato a seguirti',
  FOLLOW_REQUEST_TITLE: 'Richiesta di follow',
  FOLLOW_REQUEST_BODY: '{user} ha richiesto di seguirti',
  FOLLOW_ACCEPTED_TITLE: 'Richiesta accettata',
  FOLLOW_ACCEPTED_BODY: '{user} ha accettato la tua richiesta',
  SHARE_TITLE: 'Condivisione',
  SHARE_BODY: '{user} ha condiviso un {content} con te',
  SHARE_OWNER_TITLE: 'Condivisione',
  SHARE_OWNER_BODY: '{user} ha condiviso il tuo {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} ha condiviso il tuo {content} {channel}',
  SAVE_TITLE: 'Salvato',
  SAVE_BODY: '{user} ha salvato il tuo {content}',
  GIFT_TITLE: 'Regalo 🎁',
  GIFT_BODY: '{user} ti ha inviato {gift}',
  POLL_VOTE_TITLE: 'Voto al sondaggio',
  POLL_VOTE_BODY: '{user} ha votato al tuo sondaggio',
  NEW_CONTENT_TITLE: 'Nuovo {content}',
  NEW_CONTENT_BODY: '{user} ha condiviso un nuovo {content}',
  COIN_RECEIVED_TITLE: 'Monete ricevute',
  COIN_RECEIVED_BODY: '{user} ti ha inviato {amount} monete',
  COIN_SENT_TITLE: 'Monete inviate',
  COIN_SENT_BODY: 'Hai inviato {amount} monete a {user}',
  CONTENT_POST: 'post',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'storia',
  CHANNEL_DM: 'in una chat',
  CHANNEL_STORY: 'nella storia',
  CHANNEL_LINK: 'tramite link',
  SOMEONE: 'Qualcuno',
  GROUP: 'Gruppo',
  CHAT_NEW: 'Nuovo messaggio',
  CHAT_HIDDEN: 'Nuovo messaggio',
  CHAT_SENT: '{user} ha inviato un messaggio',
  CALL_VOICE: 'Chiamata vocale in arrivo',
  CALL_VIDEO: 'Videochiamata in arrivo',
  CALL_GROUP_VOICE: '{user} ha avviato una chiamata vocale',
  CALL_GROUP_VIDEO: '{user} ha avviato una videochiamata',
};

const FR: Record<string, string> = {
  LIKE_TITLE: 'J’aime',
  LIKE_BODY: '{user} a aimé votre {content}',
  LIKE_COMMENT_TITLE: 'Commentaire aimé',
  LIKE_COMMENT_BODY: '{user} a aimé votre commentaire',
  COMMENT_TITLE: 'Commentaire',
  COMMENT_BODY: '{user} a commenté : {comment}',
  COMMENT_BODY_EMPTY: '{user} a commenté votre {content}',
  REPLY_TITLE: 'Réponse au commentaire',
  REPLY_BODY: '{user} a répondu : {comment}',
  REPLY_BODY_EMPTY: '{user} a répondu à votre commentaire',
  MENTION_TAG_TITLE: 'Identification',
  MENTION_TAG_BODY: '{user} vous a identifié dans un {content}',
  MENTION_COMMENT_TITLE: 'Mention dans un commentaire',
  MENTION_COMMENT_BODY: '{user} vous a mentionné dans un commentaire',
  FOLLOW_TITLE: 'Nouvel abonné',
  FOLLOW_BODY: '{user} a commencé à vous suivre',
  FOLLOW_REQUEST_TITLE: 'Demande de suivi',
  FOLLOW_REQUEST_BODY: '{user} a demandé à vous suivre',
  FOLLOW_ACCEPTED_TITLE: 'Demande acceptée',
  FOLLOW_ACCEPTED_BODY: '{user} a accepté votre demande',
  SHARE_TITLE: 'Partager',
  SHARE_BODY: '{user} a partagé un {content} avec vous',
  SHARE_OWNER_TITLE: 'Partager',
  SHARE_OWNER_BODY: '{user} a partagé votre {content}',
  SHARE_OWNER_CHANNEL_BODY: '{user} a partagé votre {content} {channel}',
  SAVE_TITLE: 'Enregistré',
  SAVE_BODY: '{user} a enregistré votre {content}',
  GIFT_TITLE: 'Cadeau 🎁',
  GIFT_BODY: '{user} vous a envoyé {gift}',
  POLL_VOTE_TITLE: 'Vote au sondage',
  POLL_VOTE_BODY: '{user} a voté à votre sondage',
  NEW_CONTENT_TITLE: 'Nouveau {content}',
  NEW_CONTENT_BODY: '{user} a partagé un nouveau {content}',
  COIN_RECEIVED_TITLE: 'Pièces reçues',
  COIN_RECEIVED_BODY: '{user} vous a envoyé {amount} pièces',
  COIN_SENT_TITLE: 'Pièces envoyées',
  COIN_SENT_BODY: 'Vous avez envoyé {amount} pièces à {user}',
  CONTENT_POST: 'publication',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'story',
  CHANNEL_DM: 'dans un chat',
  CHANNEL_STORY: 'dans leur story',
  CHANNEL_LINK: 'via un lien',
  SOMEONE: 'Quelqu’un',
  GROUP: 'Groupe',
  CHAT_NEW: 'Nouveau message',
  CHAT_HIDDEN: 'Nouveau message',
  CHAT_SENT: '{user} a envoyé un message',
  CALL_VOICE: 'Appel vocal entrant',
  CALL_VIDEO: 'Appel vidéo entrant',
  CALL_GROUP_VOICE: '{user} a lancé un appel vocal',
  CALL_GROUP_VIDEO: '{user} a lancé un appel vidéo',
};

const AR: Record<string, string> = {
  LIKE_TITLE: 'إعجاب',
  LIKE_BODY: '{user} أعجب بـ {content} الخاص بك',
  LIKE_COMMENT_TITLE: 'إعجاب بالتعليق',
  LIKE_COMMENT_BODY: '{user} أعجب بتعليقك',
  COMMENT_TITLE: 'تعليق',
  COMMENT_BODY: '{user} علّق: {comment}',
  COMMENT_BODY_EMPTY: '{user} علّق على {content} الخاص بك',
  REPLY_TITLE: 'رد على تعليق',
  REPLY_BODY: '{user} رد: {comment}',
  REPLY_BODY_EMPTY: '{user} رد على تعليقك',
  MENTION_TAG_TITLE: 'إشارة',
  MENTION_TAG_BODY: '{user} أشار إليك في {content}',
  MENTION_COMMENT_TITLE: 'تم ذكرك في تعليق',
  MENTION_COMMENT_BODY: '{user} ذكرك في تعليق',
  FOLLOW_TITLE: 'متابع جديد',
  FOLLOW_BODY: '{user} بدأ بمتابعتك',
  FOLLOW_REQUEST_TITLE: 'طلب متابعة',
  FOLLOW_REQUEST_BODY: '{user} طلب متابعتك',
  FOLLOW_ACCEPTED_TITLE: 'تم قبول الطلب',
  FOLLOW_ACCEPTED_BODY: '{user} قبل طلبك',
  SHARE_TITLE: 'مشاركة',
  SHARE_BODY: '{user} شارك {content} معك',
  SHARE_OWNER_TITLE: 'مشاركة',
  SHARE_OWNER_BODY: '{user} شارك {content} الخاص بك',
  SHARE_OWNER_CHANNEL_BODY: '{user} شارك {content} الخاص بك {channel}',
  SAVE_TITLE: 'تم الحفظ',
  SAVE_BODY: '{user} حفظ {content} الخاص بك',
  GIFT_TITLE: 'هدية 🎁',
  GIFT_BODY: '{user} أرسل لك {gift}',
  POLL_VOTE_TITLE: 'تصويت',
  POLL_VOTE_BODY: '{user} صوّت في استطلاعك',
  NEW_CONTENT_TITLE: '{content} جديد',
  NEW_CONTENT_BODY: '{user} شارك {content} جديد',
  COIN_RECEIVED_TITLE: 'تم استلام عملات',
  COIN_RECEIVED_BODY: '{user} أرسل لك {amount} عملة',
  COIN_SENT_TITLE: 'تم إرسال العملات',
  COIN_SENT_BODY: 'أرسلت {amount} عملة إلى {user}',
  CONTENT_POST: 'منشور',
  CONTENT_REEL: 'فيديو',
  CONTENT_VIBE: 'جو',
  CONTENT_STORY: 'قصة',
  CHANNEL_DM: 'في محادثة',
  CHANNEL_STORY: 'في قصته',
  CHANNEL_LINK: 'عبر رابط',
  SOMEONE: 'شخص ما',
  GROUP: 'مجموعة',
  CHAT_NEW: 'رسالة جديدة',
  CHAT_HIDDEN: 'رسالة جديدة',
  CHAT_SENT: '{user} أرسل رسالة',
  CALL_VOICE: 'مكالمة صوتية واردة',
  CALL_VIDEO: 'مكالمة فيديو واردة',
  CALL_GROUP_VOICE: '{user} بدأ مكالمة صوتية',
  CALL_GROUP_VIDEO: '{user} بدأ مكالمة فيديو',
};

const UZ: Record<string, string> = {
  LIKE_TITLE: 'Yoqtirildi',
  LIKE_BODY: '{user} sizning {content}ingizni yoqtirdi',
  LIKE_COMMENT_TITLE: 'Izoh yoqdi',
  LIKE_COMMENT_BODY: '{user} izohingizni yoqtirdi',
  COMMENT_TITLE: 'Izoh',
  COMMENT_BODY: '{user} izoh qoldirdi: {comment}',
  COMMENT_BODY_EMPTY: '{user} {content}ingizga izoh qoldirdi',
  REPLY_TITLE: 'Izohga javob',
  REPLY_BODY: '{user} javob berdi: {comment}',
  REPLY_BODY_EMPTY: '{user} izohingizga javob berdi',
  MENTION_TAG_TITLE: 'Belgilash',
  MENTION_TAG_BODY: '{user} sizni {content}da belgiladi',
  MENTION_COMMENT_TITLE: 'Izohda tilga olindi',
  MENTION_COMMENT_BODY: '{user} izohda sizni tilga oldi',
  FOLLOW_TITLE: 'Yangi obunachi',
  FOLLOW_BODY: '{user} sizni kuzata boshladi',
  FOLLOW_REQUEST_TITLE: 'Obuna so‘rovi',
  FOLLOW_REQUEST_BODY: '{user} sizni kuzatishni so‘radi',
  FOLLOW_ACCEPTED_TITLE: 'So‘rov qabul qilindi',
  FOLLOW_ACCEPTED_BODY: '{user} so‘rovingizni qabul qildi',
  SHARE_TITLE: 'Ulashish',
  SHARE_BODY: '{user} siz bilan {content} ulashdi',
  SHARE_OWNER_TITLE: 'Ulashish',
  SHARE_OWNER_BODY: '{user} sizning {content}ingizni ulashdi',
  SHARE_OWNER_CHANNEL_BODY: '{user} sizning {content}ingizni {channel} ulashdi',
  SAVE_TITLE: 'Saqlangan',
  SAVE_BODY: '{user} {content}ingizni saqladi',
  GIFT_TITLE: 'Sovgʻa 🎁',
  GIFT_BODY: '{user} sizga {gift} yubordi',
  POLL_VOTE_TITLE: 'So‘rovnoma ovozi',
  POLL_VOTE_BODY: '{user} so‘rovnomangizga ovoz berdi',
  NEW_CONTENT_TITLE: 'Yangi {content}',
  NEW_CONTENT_BODY: '{user} yangi {content} ulashdi',
  COIN_RECEIVED_TITLE: 'Tangalar qabul qilindi',
  COIN_RECEIVED_BODY: '{user} sizga {amount} tanga yubordi',
  COIN_SENT_TITLE: 'Tangalar yuborildi',
  COIN_SENT_BODY: '{user} ga {amount} tanga yubordingiz',
  CONTENT_POST: 'post',
  CONTENT_REEL: 'reel',
  CONTENT_VIBE: 'vibe',
  CONTENT_STORY: 'hikoya',
  CHANNEL_DM: 'chatda',
  CHANNEL_STORY: 'hikoyasiga',
  CHANNEL_LINK: 'havola orqali',
  SOMEONE: 'Kimdir',
  GROUP: 'Guruh',
  CHAT_NEW: 'Yangi xabar',
  CHAT_HIDDEN: 'Yangi xabar',
  CHAT_SENT: '{user} xabar yubordi',
  CALL_VOICE: 'Kiruvchi ovozli qo‘ng‘iroq',
  CALL_VIDEO: 'Kiruvchi video qo‘ng‘iroq',
  CALL_GROUP_VOICE: '{user} ovozli qo‘ng‘iroq boshladi',
  CALL_GROUP_VIDEO: '{user} video qo‘ng‘iroq boshladi',
};

const KK: Record<string, string> = {
  LIKE_TITLE: 'Ұнады',
  LIKE_BODY: '{user} сіздің {content}ыңызды ұнатты',
  LIKE_COMMENT_TITLE: 'Пікір ұнады',
  LIKE_COMMENT_BODY: '{user} сіздің пікіріңізді ұнатты',
  COMMENT_TITLE: 'Пікір',
  COMMENT_BODY: '{user} пікір қалдырды: {comment}',
  COMMENT_BODY_EMPTY: '{user} {content}ыңызға пікір қалдырды',
  REPLY_TITLE: 'Пікірге жауап',
  REPLY_BODY: '{user} жауап берді: {comment}',
  REPLY_BODY_EMPTY: '{user} пікіріңізге жауап берді',
  MENTION_TAG_TITLE: 'Белгілеу',
  MENTION_TAG_BODY: '{user} сізді {content} ішінде белгіледі',
  MENTION_COMMENT_TITLE: 'Пікірде атап өтілді',
  MENTION_COMMENT_BODY: '{user} пікірде сізді атап өтті',
  FOLLOW_TITLE: 'Жаңа жазылушы',
  FOLLOW_BODY: '{user} сізге жазылды',
  FOLLOW_REQUEST_TITLE: 'Жазылу сұранысы',
  FOLLOW_REQUEST_BODY: '{user} сізге жазылуды сұрады',
  FOLLOW_ACCEPTED_TITLE: 'Сұраныс қабылданды',
  FOLLOW_ACCEPTED_BODY: '{user} сұранысыңызды қабылдады',
  SHARE_TITLE: 'Бөлісу',
  SHARE_BODY: '{user} сізбен {content} бөлісті',
  SHARE_OWNER_TITLE: 'Бөлісу',
  SHARE_OWNER_BODY: '{user} сіздің {content}ыңызды бөлісті',
  SHARE_OWNER_CHANNEL_BODY: '{user} сіздің {content}ыңызды {channel} бөлісті',
  SAVE_TITLE: 'Сақталды',
  SAVE_BODY: '{user} {content}ыңызды сақтады',
  GIFT_TITLE: 'Сыйлық 🎁',
  GIFT_BODY: '{user} сізге {gift} жіберді',
  POLL_VOTE_TITLE: 'Сауалнама дауысы',
  POLL_VOTE_BODY: '{user} сауалнамаңызда дауыс берді',
  NEW_CONTENT_TITLE: 'Жаңа {content}',
  NEW_CONTENT_BODY: '{user} жаңа {content} бөлісті',
  COIN_RECEIVED_TITLE: 'Монеталар алынды',
  COIN_RECEIVED_BODY: '{user} сізге {amount} монета жіберді',
  COIN_SENT_TITLE: 'Монеталар жіберілді',
  COIN_SENT_BODY: '{user} пайдаланушысына {amount} монета жібердіңіз',
  CONTENT_POST: 'жазба',
  CONTENT_REEL: 'рил',
  CONTENT_VIBE: 'вайб',
  CONTENT_STORY: 'стори',
  CHANNEL_DM: 'чатта',
  CHANNEL_STORY: 'сторисіне',
  CHANNEL_LINK: 'сілтеме арқылы',
  SOMEONE: 'Біреу',
  GROUP: 'Топ',
  CHAT_NEW: 'Жаңа хабар',
  CHAT_HIDDEN: 'Жаңа хабар',
  CHAT_SENT: '{user} хабар жіберді',
  CALL_VOICE: 'Кіріс дауыстық қоңырау',
  CALL_VIDEO: 'Кіріс бейне қоңырау',
  CALL_GROUP_VOICE: '{user} дауыстық қоңырау бастады',
  CALL_GROUP_VIDEO: '{user} бейне қоңырау бастады',
};

const BY_LANG: Record<string, Record<string, string>> = {
  en: EN,
  hi: HI,
  ru: RU,
  uk: UK,
  pl: PL,
  zh: ZH,
  ja: JA,
  tr: TR,
  es: ES,
  de: DE,
  ko: KO,
  pt: PT,
  it: IT,
  fr: FR,
  ar: AR,
  uz: UZ,
  kk: KK,
};

/** Linkgram feed/follow/payments titles not already in BY_LANG bodies. */
const LINKGRAM_OVERLAY: Record<string, Record<string, string>> = {
  ru: {
    COMMENT_POST_TITLE: 'Комментарий к посту',
    COMMENT_REEL_TITLE: 'Комментарий к ролику',
    COMMENT_VIBE_TITLE: 'Комментарий к вайбу',
    MENTION_TAG_BODY: '{user} отметил вас',
    MENTION_COMMENT_TITLE: 'Упоминание в комментарии',
    MENTION_COMMENT_BODY: '{user} прокомментировал {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Запрос принят',
    FOLLOW_ACCEPTED_BODY: '{user} принял ваш запрос',
    UNFOLLOW_TITLE: 'Отписка',
    UNFOLLOW_BODY: '{user} отписался от вас',
    REMOVED_FOLLOWER_TITLE: 'Удалён из подписчиков',
    REMOVED_FOLLOWER_BODY: '{user} удалил вас из подписчиков',
    DISLIKE_TITLE: 'Не понравилось',
    DISLIKE_BODY: '{user} не понравился ваш {content}',
    NEW_CONTENT_BODY: '{user} поделился новым {content}',
    GIFT_TITLE: 'Подарок 🎁',
  },
  uk: {
    COMMENT_POST_TITLE: 'Коментар до допису',
    COMMENT_REEL_TITLE: 'Коментар до ролика',
    COMMENT_VIBE_TITLE: 'Коментар до вайбу',
    MENTION_TAG_BODY: '{user} позначив вас',
    MENTION_COMMENT_TITLE: 'Згадування в коментарі',
    MENTION_COMMENT_BODY: '{user} прокоментував {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Запит прийнято',
    FOLLOW_ACCEPTED_BODY: '{user} прийняв ваш запит',
    UNFOLLOW_TITLE: 'Відписка',
    UNFOLLOW_BODY: '{user} відписався від вас',
    REMOVED_FOLLOWER_TITLE: 'Видалено з підписників',
    REMOVED_FOLLOWER_BODY: '{user} видалив вас з підписників',
    DISLIKE_TITLE: 'Не вподобано',
    DISLIKE_BODY: '{user} не вподобав ваш {content}',
    NEW_CONTENT_BODY: '{user} поділився новим {content}',
    GIFT_TITLE: 'Подарунок 🎁',
  },
  pl: {
    COMMENT_POST_TITLE: 'Komentarz do posta',
    COMMENT_REEL_TITLE: 'Komentarz do filmu',
    COMMENT_VIBE_TITLE: 'Komentarz do vibe',
    MENTION_TAG_BODY: '{user} oznaczył(a) Cię',
    MENTION_COMMENT_TITLE: 'Wzmianka w komentarzu',
    MENTION_COMMENT_BODY: '{user} skomentował(a) {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Prośba zaakceptowana',
    FOLLOW_ACCEPTED_BODY: '{user} zaakceptował twoją prośbę',
    UNFOLLOW_TITLE: 'Przestał obserwować',
    UNFOLLOW_BODY: '{user} przestał cię obserwować',
    REMOVED_FOLLOWER_TITLE: 'Usunięto z obserwujących',
    REMOVED_FOLLOWER_BODY: '{user} usunął cię z obserwujących',
    DISLIKE_TITLE: 'Nie polubiono',
    DISLIKE_BODY: '{user} nie polubił(a) Twojego {content}',
    NEW_CONTENT_BODY: '{user} udostępnił nowy {content}',
    GIFT_TITLE: 'Prezent 🎁',
  },
  zh: {
    COMMENT_POST_TITLE: '帖子评论',
    COMMENT_REEL_TITLE: '视频评论',
    COMMENT_VIBE_TITLE: '氛围评论',
    MENTION_TAG_BODY: '{user} 标记了你',
    MENTION_COMMENT_TITLE: '评论中提到你',
    MENTION_COMMENT_BODY: '{user} 评论了 {comment}',
    FOLLOW_ACCEPTED_TITLE: '请求已接受',
    FOLLOW_ACCEPTED_BODY: '{user} 接受了你的请求',
    UNFOLLOW_TITLE: '取消关注',
    UNFOLLOW_BODY: '{user} 取消关注了你',
    REMOVED_FOLLOWER_TITLE: '移除关注者',
    REMOVED_FOLLOWER_BODY: '{user} 将你移出了关注者',
    DISLIKE_TITLE: '取消点赞',
    DISLIKE_BODY: '{user} 不喜欢你的 {content}',
    NEW_CONTENT_BODY: '{user} 分享了一个新的{content}',
    GIFT_TITLE: '礼物 🎁',
  },
  ja: {
    COMMENT_POST_TITLE: '投稿へのコメント',
    COMMENT_REEL_TITLE: 'リールへのコメント',
    COMMENT_VIBE_TITLE: 'バイブへのコメント',
    MENTION_TAG_BODY: '{user} があなたをタグ付けしました',
    MENTION_COMMENT_TITLE: 'コメントでメンション',
    MENTION_COMMENT_BODY: '{user} がコメントしました {comment}',
    FOLLOW_ACCEPTED_TITLE: 'リクエスト承認',
    FOLLOW_ACCEPTED_BODY: '{user} がリクエストを承認しました',
    UNFOLLOW_TITLE: 'フォロー解除',
    UNFOLLOW_BODY: '{user} がフォローを解除しました',
    REMOVED_FOLLOWER_TITLE: 'フォロワーから削除',
    REMOVED_FOLLOWER_BODY: '{user} があなたをフォロワーから削除しました',
    DISLIKE_TITLE: 'いいね解除',
    DISLIKE_BODY: '{user} があなたの {content} をいいねしませんでした',
    NEW_CONTENT_BODY: '{user} が新しい{content}を共有しました',
    GIFT_TITLE: 'ギフト 🎁',
  },
  tr: {
    COMMENT_POST_TITLE: 'Gönderiye yorum',
    COMMENT_REEL_TITLE: 'Reel yorumu',
    COMMENT_VIBE_TITLE: 'Vibe yorumu',
    MENTION_TAG_BODY: '{user} seni etiketledi',
    MENTION_COMMENT_TITLE: 'Yorumda Bahsedildi',
    MENTION_COMMENT_BODY: '{user} yorum yaptı {comment}',
    FOLLOW_ACCEPTED_TITLE: 'İstek Kabul Edildi',
    FOLLOW_ACCEPTED_BODY: '{user} isteğini kabul etti',
    UNFOLLOW_TITLE: 'Takibi Bıraktı',
    UNFOLLOW_BODY: '{user} seni takip etmeyi bıraktı',
    REMOVED_FOLLOWER_TITLE: 'Takipçilerden çıkarıldı',
    REMOVED_FOLLOWER_BODY: '{user} seni takipçilerinden çıkardı',
    DISLIKE_TITLE: 'Beğenilmedi',
    DISLIKE_BODY: '{user} {content} içeriğini beğenmedi',
    NEW_CONTENT_BODY: '{user} yeni bir {content} paylaştı',
    GIFT_TITLE: 'Hediye 🎁',
  },
  es: {
    COMMENT_POST_TITLE: 'Comentario en publicación',
    COMMENT_REEL_TITLE: 'Comentario en reel',
    COMMENT_VIBE_TITLE: 'Comentario en vibe',
    MENTION_TAG_BODY: '{user} te etiquetó',
    MENTION_COMMENT_TITLE: 'Mención en comentario',
    MENTION_COMMENT_BODY: '{user} comentó {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Solicitud aceptada',
    FOLLOW_ACCEPTED_BODY: '{user} aceptó tu solicitud',
    UNFOLLOW_TITLE: 'Dejó de seguir',
    UNFOLLOW_BODY: '{user} dejó de seguirte',
    REMOVED_FOLLOWER_TITLE: 'Eliminado de seguidores',
    REMOVED_FOLLOWER_BODY: '{user} te eliminó de sus seguidores',
    DISLIKE_TITLE: 'No me gusta',
    DISLIKE_BODY: '{user} no le gustó tu {content}',
    NEW_CONTENT_BODY: '{user} compartió un nuevo {content}',
    GIFT_TITLE: 'Regalo 🎁',
  },
  de: {
    COMMENT_POST_TITLE: 'Kommentar zum Beitrag',
    COMMENT_REEL_TITLE: 'Kommentar zum Reel',
    COMMENT_VIBE_TITLE: 'Kommentar zum Vibe',
    MENTION_TAG_BODY: '{user} hat dich markiert',
    MENTION_COMMENT_TITLE: 'Erwähnung im Kommentar',
    MENTION_COMMENT_BODY: '{user} kommentierte {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Anfrage angenommen',
    FOLLOW_ACCEPTED_BODY: '{user} hat deine Anfrage angenommen',
    UNFOLLOW_TITLE: 'Nicht mehr folgen',
    UNFOLLOW_BODY: '{user} folgt dir nicht mehr',
    REMOVED_FOLLOWER_TITLE: 'Aus Followern entfernt',
    REMOVED_FOLLOWER_BODY: '{user} hat dich aus seinen Followern entfernt',
    DISLIKE_TITLE: 'Gefällt mir nicht',
    DISLIKE_BODY: '{user} mochte deinen {content} nicht',
    NEW_CONTENT_BODY: '{user} hat einen neuen {content} geteilt',
    GIFT_TITLE: 'Geschenk 🎁',
  },
  ko: {
    COMMENT_POST_TITLE: '게시물 댓글',
    COMMENT_REEL_TITLE: '릴 댓글',
    COMMENT_VIBE_TITLE: '바이브 댓글',
    MENTION_TAG_BODY: '{user} 님이 회원님을 태그했습니다',
    MENTION_COMMENT_TITLE: '댓글에서 언급됨',
    MENTION_COMMENT_BODY: '{user} 님이 댓글을 남겼습니다 {comment}',
    FOLLOW_ACCEPTED_TITLE: '요청 수락',
    FOLLOW_ACCEPTED_BODY: '{user} 님이 요청을 수락했습니다',
    UNFOLLOW_TITLE: '언팔로우',
    UNFOLLOW_BODY: '{user} 님이 언팔로우했습니다',
    REMOVED_FOLLOWER_TITLE: '팔로워 제거',
    REMOVED_FOLLOWER_BODY: '{user} 님이 팔로워에서 제거했습니다',
    DISLIKE_TITLE: '좋아요 취소',
    DISLIKE_BODY: '{user} 님이 회원님의 {content}을(를) 좋아하지 않습니다',
    NEW_CONTENT_BODY: '{user} 님이 새 {content}을(를) 공유했습니다',
    GIFT_TITLE: '선물 🎁',
  },
  pt: {
    COMMENT_POST_TITLE: 'Comentário na publicação',
    COMMENT_REEL_TITLE: 'Comentário no reel',
    COMMENT_VIBE_TITLE: 'Comentário no vibe',
    MENTION_TAG_BODY: '{user} marcou você',
    MENTION_COMMENT_TITLE: 'Menção em comentário',
    MENTION_COMMENT_BODY: '{user} comentou {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Pedido aceito',
    FOLLOW_ACCEPTED_BODY: '{user} aceitou seu pedido',
    UNFOLLOW_TITLE: 'Deixou de seguir',
    UNFOLLOW_BODY: '{user} deixou de te seguir',
    REMOVED_FOLLOWER_TITLE: 'Removido dos seguidores',
    REMOVED_FOLLOWER_BODY: '{user} removeu você dos seguidores',
    DISLIKE_TITLE: 'Não curtiu',
    DISLIKE_BODY: '{user} não curtiu seu {content}',
    NEW_CONTENT_BODY: '{user} compartilhou um novo {content}',
    GIFT_TITLE: 'Presente 🎁',
  },
  it: {
    COMMENT_POST_TITLE: 'Commento al post',
    COMMENT_REEL_TITLE: 'Commento al reel',
    COMMENT_VIBE_TITLE: 'Commento al vibe',
    MENTION_TAG_BODY: '{user} ti ha taggato',
    MENTION_COMMENT_TITLE: 'Menzione nel commento',
    MENTION_COMMENT_BODY: '{user} ha commentato {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Richiesta accettata',
    FOLLOW_ACCEPTED_BODY: '{user} ha accettato la tua richiesta',
    UNFOLLOW_TITLE: 'Non segue più',
    UNFOLLOW_BODY: '{user} ha smesso di seguirti',
    REMOVED_FOLLOWER_TITLE: 'Rimosso dai follower',
    REMOVED_FOLLOWER_BODY: '{user} ti ha rimosso dai follower',
    DISLIKE_TITLE: 'Non mi piace',
    DISLIKE_BODY: '{user} non ha messo mi piace al tuo {content}',
    NEW_CONTENT_BODY: '{user} ha condiviso un nuovo {content}',
    GIFT_TITLE: 'Regalo 🎁',
  },
  fr: {
    COMMENT_POST_TITLE: 'Commentaire sur la publication',
    COMMENT_REEL_TITLE: 'Commentaire sur le reel',
    COMMENT_VIBE_TITLE: 'Commentaire sur le vibe',
    MENTION_TAG_BODY: '{user} vous a identifié',
    MENTION_COMMENT_TITLE: 'Mention dans un commentaire',
    MENTION_COMMENT_BODY: '{user} a commenté {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Demande acceptée',
    FOLLOW_ACCEPTED_BODY: '{user} a accepté votre demande',
    UNFOLLOW_TITLE: 'Désabonnement',
    UNFOLLOW_BODY: '{user} a arrêté de vous suivre',
    REMOVED_FOLLOWER_TITLE: 'Retiré des abonnés',
    REMOVED_FOLLOWER_BODY: '{user} vous a retiré de ses abonnés',
    DISLIKE_TITLE: 'Je n’aime pas',
    DISLIKE_BODY: '{user} n’a pas aimé votre {content}',
    NEW_CONTENT_BODY: '{user} a partagé un nouveau {content}',
    GIFT_TITLE: 'Cadeau 🎁',
  },
  ar: {
    COMMENT_POST_TITLE: 'تعليق على منشور',
    COMMENT_REEL_TITLE: 'تعليق على فيديو',
    COMMENT_VIBE_TITLE: 'تعليق على جو',
    MENTION_TAG_BODY: '{user} قام بالإشارة إليك',
    MENTION_COMMENT_TITLE: 'تم ذكرك في تعليق',
    MENTION_COMMENT_BODY: '{user} علّق {comment}',
    FOLLOW_ACCEPTED_TITLE: 'تم قبول الطلب',
    FOLLOW_ACCEPTED_BODY: '{user} قبل طلبك',
    UNFOLLOW_TITLE: 'إلغاء المتابعة',
    UNFOLLOW_BODY: '{user} ألغى متابعتك',
    REMOVED_FOLLOWER_TITLE: 'إزالة من المتابعين',
    REMOVED_FOLLOWER_BODY: '{user} أزالك من المتابعين',
    DISLIKE_TITLE: 'لم يعجب',
    DISLIKE_BODY: '{user} لست مهتماً بهذا {content}',
    NEW_CONTENT_BODY: '{user} شارك {content} جديد',
    GIFT_TITLE: 'هدية 🎁',
  },
  uz: {
    COMMENT_POST_TITLE: 'Postga izoh',
    COMMENT_REEL_TITLE: 'Reelga izoh',
    COMMENT_VIBE_TITLE: 'Vibega izoh',
    MENTION_TAG_BODY: '{user} sizni belgiladi',
    MENTION_COMMENT_TITLE: 'Izohda tilga olindi',
    MENTION_COMMENT_BODY: '{user} izoh qoldirdi {comment}',
    FOLLOW_ACCEPTED_TITLE: 'So‘rov qabul qilindi',
    FOLLOW_ACCEPTED_BODY: '{user} so‘rovingizni qabul qildi',
    UNFOLLOW_TITLE: 'Obunadan chiqdi',
    UNFOLLOW_BODY: '{user} sizni kuzatishni to‘xtatdi',
    REMOVED_FOLLOWER_TITLE: 'Obunachilardan olib tashlandi',
    REMOVED_FOLLOWER_BODY: '{user} sizni obunachilardan olib tashladi',
    DISLIKE_TITLE: 'Yoqtirilmadi',
    DISLIKE_BODY: '{user} sizning {content}ingizni yoqtirmadi',
    NEW_CONTENT_BODY: '{user} yangi {content} ulashdi',
    GIFT_TITLE: 'Sovgʻa 🎁',
  },
  kk: {
    COMMENT_POST_TITLE: 'Жазбаға пікір',
    COMMENT_REEL_TITLE: 'Рилге пікір',
    COMMENT_VIBE_TITLE: 'Вайбқа пікір',
    MENTION_TAG_BODY: '{user} сізді белгіледі',
    MENTION_COMMENT_TITLE: 'Пікірде атап өтілді',
    MENTION_COMMENT_BODY: '{user} пікір қалдырды {comment}',
    FOLLOW_ACCEPTED_TITLE: 'Сұраныс қабылданды',
    FOLLOW_ACCEPTED_BODY: '{user} сұранысыңызды қабылдады',
    UNFOLLOW_TITLE: 'Жазылудан шықты',
    UNFOLLOW_BODY: '{user} сізге жазылудан шықты',
    REMOVED_FOLLOWER_TITLE: 'Жазылушылардан жойылды',
    REMOVED_FOLLOWER_BODY: '{user} сізді жазылушылардан жойды',
    DISLIKE_TITLE: 'Ұнамады',
    DISLIKE_BODY: '{user} сіздің {content}ыңызды ұнатпады',
    NEW_CONTENT_BODY: '{user} жаңа {content} бөлісті',
    GIFT_TITLE: 'Сыйлық 🎁',
  },
  hi: {
    COMMENT_POST_TITLE: 'पोस्ट पर टिप्पणी',
    COMMENT_REEL_TITLE: 'रील पर टिप्पणी',
    COMMENT_VIBE_TITLE: 'वाइब पर टिप्पणी',
    MENTION_TAG_BODY: '{user} ने आपको टैग किया',
    MENTION_COMMENT_TITLE: 'टिप्पणी में उल्लेख',
    MENTION_COMMENT_BODY: '{user} ने टिप्पणी की {comment}',
    FOLLOW_ACCEPTED_TITLE: 'अनुरोध स्वीकार',
    FOLLOW_ACCEPTED_BODY: '{user} ने आपका अनुरोध स्वीकार किया',
    UNFOLLOW_TITLE: 'अनफ़ॉलो',
    UNFOLLOW_BODY: '{user} ने आपको अनफ़ॉलो किया',
    REMOVED_FOLLOWER_TITLE: 'फ़ॉलोअर्स से हटाया',
    REMOVED_FOLLOWER_BODY: '{user} ने आपको अपने फ़ॉलोअर्स से हटाया',
    DISLIKE_TITLE: 'रुचि नहीं',
    DISLIKE_BODY: '{user} आपकी {content} में रुचि नहीं रखते',
    NEW_CONTENT_BODY: '{user} ने एक नई {content} शेयर की',
    GIFT_TITLE: 'उपहार 🎁',
    PROFILE_VISIT_TITLE: 'प्रोफ़ाइल विज़िट',
    PROFILE_VISIT_BODY: '{user} ने आपकी प्रोफ़ाइल देखी',
    WELCOME_TITLE: 'OneVibe में स्वागत है',
    WELCOME_BODY:
      'नमस्ते {user}! आपका खाता तैयार है — एक्सप्लोर करें और लोगों से जुड़ें।',
    VERIFICATION_APPROVED_TITLE: 'खाता सत्यापित',
    VERIFICATION_APPROVED_BODY:
      'आपका खाता सत्यापित हो गया है। अब आपके पास ब्लू टिक है।',
    VERIFICATION_REJECTED_TITLE: 'सत्यापन अपडेट',
    VERIFICATION_REJECTED_BODY: 'आपका सत्यापन अनुरोध स्वीकृत नहीं हुआ।',
  },
};

function applyParams(text: string, params: NotificationI18nParams): string {
  let out = text;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

export function t(
  lang: string,
  key: string,
  params: NotificationI18nParams = {},
): string {
  const code = resolveTextLang(lang);
  const text =
    BY_LANG[code]?.[key] || LINKGRAM_OVERLAY[code]?.[key] || EN[key] || key;
  return applyParams(text, params);
}

function isCopyKey(key: string): key is NotificationCopyKey {
  return key in COPY;
}

function isContentKind(value: string): value is ContentKind {
  return value === 'post' || value === 'reel' || value === 'vibe' || value === 'story';
}

function resolveDisplayParams(
  lang: string,
  params: NotificationI18nParams,
): NotificationI18nParams {
  const out: NotificationI18nParams = { ...params };
  if (!out.user?.trim()) {
    out.user = t(lang, 'SOMEONE');
  }
  if (out.content && isContentKind(out.content)) {
    out.content = t(lang, CONTENT_KEYS[out.content]);
  }
  if (out.channel && CHANNEL_KEYS[out.channel]) {
    out.channel = t(lang, CHANNEL_KEYS[out.channel]);
  }
  return out;
}

export function renderNotificationCopy(
  lang: string,
  key: string,
  params: NotificationI18nParams = {},
): { title: string; body: string } {
  const display = resolveDisplayParams(lang, params);
  if (!isCopyKey(key)) {
    return { title: t(lang, key, display), body: t(lang, key, display) };
  }

  const spec = COPY[key];
  let bodyKey = spec.body;
  let titleKey = spec.title;
  if (key === 'COMMENT') {
    titleKey =
      params.content === 'vibe'
        ? 'COMMENT_VIBE_TITLE'
        : params.content === 'reel'
          ? 'COMMENT_REEL_TITLE'
          : 'COMMENT_POST_TITLE';
    if (!params.comment?.trim()) bodyKey = 'COMMENT_BODY_EMPTY';
  } else if (key === 'REPLY' && !params.comment?.trim()) {
    bodyKey = 'REPLY_BODY_EMPTY';
  } else if (key === 'MENTION_COMMENT' && !params.comment?.trim()) {
    bodyKey = 'MENTION_COMMENT_BODY_EMPTY';
  } else if (key === 'SHARE_OWNER' && params.channel?.trim()) {
    bodyKey = 'SHARE_OWNER_CHANNEL_BODY';
  }

  let body = t(lang, bodyKey, display);
  if ((key === 'COIN_RECEIVED' || key === 'COIN_SENT') && params.note?.trim()) {
    body = `${body}: ${params.note.trim()}`;
  }

  return {
    title: t(lang, titleKey, display),
    body,
  };
}

export function chatMediaLabel(
  lang: string,
  type: string,
): string | null {
  switch (type) {
    case 'image':
      return t(lang, 'CHAT_PHOTO');
    case 'video':
      return t(lang, 'CHAT_VIDEO');
    case 'audio':
      return t(lang, 'CHAT_AUDIO');
    case 'voice':
      return t(lang, 'CHAT_VOICE');
    case 'file':
      return t(lang, 'CHAT_FILE');
    case 'poll':
      return t(lang, 'CHAT_POLL');
    case 'location':
      return t(lang, 'CHAT_LOCATION');
    case 'post':
    case 'reel':
      return t(lang, 'CHAT_POST');
    case 'call':
      return t(lang, 'CHAT_CALL');
    case 'system':
      return t(lang, 'CHAT_GROUP_UPDATE');
    default:
      return null;
  }
}

export function groupIdsByLang(
  ids: string[],
  langById: Map<string, string>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const lang = resolveTextLang(langById.get(id));
    const list = groups.get(lang);
    if (list) list.push(id);
    else groups.set(lang, [id]);
  }
  return groups;
}

export type InboxCopySource = {
  type: string;
  title?: string | null;
  body?: string | null;
  entityType?: string | null;
  link?: string | null;
  i18nKey?: string | null;
  i18nParams?: NotificationI18nParams | null;
  actor?: { username: string | null; fullName: string | null } | null;
};

function contentKindFrom(
  entityType?: string | null,
  link?: string | null,
): ContentKind {
  const t = entityType?.toLowerCase();
  if (t === 'reel' || t === 'vibe' || t === 'story') return t;
  if (link?.includes('/vibes')) return 'vibe';
  if (link?.includes('/reels')) return 'reel';
  if (link?.includes('/stories')) return 'story';
  return 'post';
}

function extractAfter(
  text: string | null | undefined,
  patterns: RegExp[],
): string | undefined {
  if (!text) return undefined;
  for (const p of patterns) {
    const m = text.match(p);
    const value = m?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function inferLegacyCopy(source: InboxCopySource): {
  key: string;
  params: NotificationI18nParams;
} | null {
  const type = source.type?.toLowerCase() ?? '';
  if (type === 'admin') return null;

  const actorName =
    source.actor?.fullName?.trim() || source.actor?.username?.trim() || '';
  const blob = `${source.title ?? ''} ${source.body ?? ''}`.toLowerCase();
  const content = contentKindFrom(source.entityType, source.link);
  const params: NotificationI18nParams = {};
  if (actorName) params.user = actorName;

  const comment = extractAfter(source.body, [
    /(?:commented|replied|mentioned):\s*(.+)$/i,
    /commented\s+(.+)$/i,
  ]);

  switch (type) {
    case 'like':
      if (/comment/.test(blob)) {
        return { key: 'LIKE_COMMENT', params };
      }
      params.content = content;
      return { key: 'LIKE', params };
    case 'comment':
      params.content = content;
      if (comment) params.comment = comment;
      if (/repl(y|ied)/.test(blob)) {
        return { key: 'REPLY', params };
      }
      return { key: 'COMMENT', params };
    case 'mention':
      params.content = content;
      if (comment) params.comment = comment;
      if (/tag/.test(blob)) return { key: 'MENTION_TAG', params };
      return { key: 'MENTION_COMMENT', params };
    case 'follow':
      return { key: 'FOLLOW', params };
    case 'follow_request':
      return { key: 'FOLLOW_REQUEST', params };
    case 'follow_accepted':
      return { key: 'FOLLOW_ACCEPTED', params };
    case 'share':
      params.content = content;
      if (/in a chat/.test(blob)) params.channel = 'dm';
      else if (/to their story/.test(blob)) params.channel = 'story';
      else if (/via link/.test(blob)) params.channel = 'copy_link';
      if (/with you/.test(blob) || /shared a /.test(blob)) {
        return { key: 'SHARE', params };
      }
      return { key: 'SHARE_OWNER', params };
    case 'save':
      params.content = content;
      return { key: 'SAVE', params };
    case 'gift': {
      const gift =
        extractAfter(source.body, [/sent you (?:a |an )?(.+)$/i]) || 'gift';
      params.gift = gift;
      return { key: 'GIFT', params };
    }
    case 'poll_vote':
      return { key: 'POLL_VOTE', params };
    case 'coin_received': {
      const amount =
        extractAfter(source.body, [/sent you ([\d,.]+)/i]) || '';
      if (amount) params.amount = amount;
      const note = extractAfter(source.body, [/coins:\s*(.+)$/i]);
      if (note) params.note = note;
      return { key: 'COIN_RECEIVED', params };
    }
    case 'coin_sent': {
      const amount =
        extractAfter(source.body, [/You sent ([\d,.]+)/i]) || '';
      if (amount) params.amount = amount;
      const note = extractAfter(source.body, [/coins:\s*(.+)$/i]);
      if (note) params.note = note;
      return { key: 'COIN_SENT', params };
    }
    case 'system': {
      const entity = source.entityType?.toLowerCase() ?? '';
      if (entity === 'profile') return { key: 'PROFILE_VISIT', params };
      if (entity === 'welcome') {
        const hi = extractAfter(source.body, [/^Hi\s+(.+?)!/i]);
        if (hi) params.user = hi;
        return { key: 'WELCOME', params };
      }
      if (entity === 'verification') {
        if (/verified/.test(blob) && !/not approved/.test(blob)) {
          return { key: 'VERIFICATION_APPROVED', params };
        }
        const note = extractAfter(source.body, [/not approved:\s*(.+)$/i]);
        if (note) params.note = note;
        return { key: 'VERIFICATION_REJECTED', params };
      }
      if (
        entity === 'post' ||
        entity === 'vibe' ||
        entity === 'reel' ||
        /new (post|vibe|reel)/.test(blob) ||
        /posted a new/.test(blob) ||
        /shared a new/.test(blob)
      ) {
        params.content = content;
        return { key: 'NEW_CONTENT', params };
      }
      return null;
    }
    default:
      return null;
  }
}

export function localizeInboxItem(
  lang: string,
  source: InboxCopySource,
): { title: string | null; body: string | null } {
  const inferred = source.i18nKey
    ? { key: source.i18nKey, params: { ...(source.i18nParams ?? {}) } }
    : inferLegacyCopy(source);
  if (!inferred) {
    return { title: source.title ?? null, body: source.body ?? null };
  }
  const actorName =
    source.actor?.fullName?.trim() || source.actor?.username?.trim() || '';
  if (!inferred.params.user && actorName) {
    inferred.params.user = actorName;
  }
  const copy = renderNotificationCopy(lang, inferred.key, inferred.params);
  if (
    inferred.key === 'VERIFICATION_REJECTED' &&
    inferred.params.note?.trim()
  ) {
    return {
      title: copy.title,
      body: `${copy.body}: ${inferred.params.note.trim()}`,
    };
  }
  return copy;
}
