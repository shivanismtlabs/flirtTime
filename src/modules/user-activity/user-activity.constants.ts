/**
 * Known activity / target keys.
 * DB accepts any string — these constants are for autocomplete + consistency.
 * Add new events here as features need them; no migration required.
 */

export const UserActivityEvent = {
  // session & security
  Login: 'login',
  LoginFailed: 'login_failed',
  SocialLogin: 'social_login',
  SocialRegister: 'social_register',
  Logout: 'logout',
  LogoutAllDevices: 'logout_all_devices',
  TokenRefresh: 'token_refresh',
  PasswordReset: 'password_reset',
  PasswordChanged: 'password_changed',
  OtpSent: 'otp_sent',
  OtpVerified: 'otp_verified',
  OtpFailed: 'otp_failed',
  DeviceRegistered: 'device_registered',
  DeviceRemoved: 'device_removed',
  EmailChanged: 'email_changed',
  PhoneChanged: 'phone_changed',
  // account & profile
  ProfileUpdated: 'profile_updated',
  AvatarChanged: 'avatar_changed',
  PrivacySettingsChanged: 'privacy_settings_changed',
  AccountSuspended: 'account_suspended',
  AccountReactivated: 'account_reactivated',
  AccountDeleted: 'account_deleted',
  VerificationRequested: 'verification_requested',
  VerificationApproved: 'verification_approved',
  VerificationRejected: 'verification_rejected',
  // social & content
  PostCreated: 'post_created',
  PostDeleted: 'post_deleted',
  ReelCreated: 'reel_created',
  VibeCreated: 'vibe_created',
  StoryCreated: 'story_created',
  StoryDeleted: 'story_deleted',
  CommentCreated: 'comment_created',
  CommentDeleted: 'comment_deleted',
  Follow: 'follow',
  Unfollow: 'unfollow',
  FollowRequest: 'follow_request',
  FollowAccept: 'follow_accept',
  FollowReject: 'follow_reject',
  Block: 'block',
  Unblock: 'unblock',
  ReportUser: 'report_user',
  ReportPost: 'report_post',
  // chat / calls / channels
  ConversationStarted: 'conversation_started',
  MessageSent: 'message_sent',
  CallStarted: 'call_started',
  CallEnded: 'call_ended',
  CallMissed: 'call_missed',
  ChannelJoined: 'channel_joined',
  ChannelLeft: 'channel_left',
  ChannelCreated: 'channel_created',
  // wallet
  CoinPurchase: 'coin_purchase',
  GiftSent: 'gift_sent',
  GiftReceived: 'gift_received',
  WithdrawalRequested: 'withdrawal_requested',
  WithdrawalCompleted: 'withdrawal_completed',
  WithdrawalFailed: 'withdrawal_failed',
  // misc
  HelpRequestCreated: 'help_request_created',
  ContactsSynced: 'contacts_synced',
} as const;

export type UserActivityEventType =
  | (typeof UserActivityEvent)[keyof typeof UserActivityEvent]
  | (string & {});

export const UserActivityTargetType = {
  User: 'user',
  Post: 'post',
  Story: 'story',
  Comment: 'comment',
  Conversation: 'conversation',
  Message: 'message',
  Call: 'call',
  Channel: 'channel',
  Device: 'device',
  WalletPurchase: 'wallet_purchase',
  WalletWithdrawal: 'wallet_withdrawal',
  Gift: 'gift',
  Report: 'report',
  Verification: 'verification',
  HelpRequest: 'help_request',
  Notification: 'notification',
} as const;

export type UserActivityTargetTypeValue =
  | (typeof UserActivityTargetType)[keyof typeof UserActivityTargetType]
  | (string & {});

export const UserActivityActorType = {
  User: 'user',
  Admin: 'admin',
  System: 'system',
} as const;

export type UserActivityActorTypeValue =
  (typeof UserActivityActorType)[keyof typeof UserActivityActorType];

export const UserSessionEndReason = {
  Logout: 'logout',
  LogoutAll: 'logout_all',
  Expired: 'expired',
  Revoked: 'revoked',
  Forced: 'forced',
} as const;

export type UserSessionEndReasonValue =
  (typeof UserSessionEndReason)[keyof typeof UserSessionEndReason];
