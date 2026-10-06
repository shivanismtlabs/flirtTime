export type CallType = 'audio' | 'video';
export type CallStatus =
  | 'ringing'
  | 'ongoing'
  | 'ended'
  | 'missed'
  | 'declined'
  | 'cancelled';

export type CallParticipantState =
  | 'ringing'
  | 'joined'
  | 'left'
  | 'declined'
  | 'missed';

export type CallUserSummary = {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
};

export type CallParticipantDto = {
  userId: string;
  role: 'caller' | 'member';
  state: CallParticipantState;
  user: CallUserSummary | null;
};

export type CallDto = {
  id: string;
  conversationId: string;
  conversationType: 'direct' | 'group';
  conversationTitle: string | null;
  type: CallType;
  status: CallStatus;
  channelName: string;
  callerId: string;
  /** Null for group calls */
  calleeId: string | null;
  caller: CallUserSummary | null;
  callee: CallUserSummary | null;
  participants: CallParticipantDto[];
  appId: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type CallSessionPayload = {
  call: CallDto;
  token: string;
  uid: string;
  appId: string;
};

export type CreateCallInput = {
  conversationId: string;
  type: CallType;
};
