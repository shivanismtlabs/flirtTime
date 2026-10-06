export type {
  CreateCommentInput,
  FeedAuthor as VibeAuthor,
  FeedComment as VibeComment,
  FeedCommentAuthor as VibeCommentAuthor,
  FeedCommentsPage as VibeCommentsPage,
  FeedFlags as VibeFlags,
  FeedLiker as VibeLiker,
  FeedLikersPage as VibeLikersPage,
  FeedMediaItem as VibeMediaItem,
  FeedReportRow as VibeReportRow,
  FeedReportsPage as VibeReportsPage,
  FeedStats as VibeStats,
  FeedTaggedUser as VibeTaggedUser,
  FeedViewer as VibeViewer,
  FeedViewersPage as VibeViewersPage,
  GiftResult,
  GiftType,
  LikeResult,
  PostSettingsInput,
  ReportPostInput,
  ReportResult,
  SaveResult,
  SendGiftInput,
  ShareChannel,
  ShareDeliveredItem,
  ShareFailedItem,
  SharePostInput,
  ShareResult,
  UnreportResult,
  UpdatePostInput,
  ViewResult,
} from '../feed/feed.types.js';

import type { FeedPost, CreatePostInput } from '../feed/feed.types.js';

export interface VibePollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
  position: number;
}

export interface VibePoll {
  id: string;
  totalVotes: number;
  hasVoted: boolean;
  selectedOptionId: string | null;
  options: VibePollOption[];
}

/** Vibe row — feed post shape plus thread + expiry + optional poll. */
export interface VibePost extends FeedPost {
  parentId: string | null;
  mainParentId: string | null;
  expiredAt: string | null;
  /** True when past 24h age or `expiredAt` (server clock). */
  isExpired: boolean;
  poll: VibePoll | null;
  /** Direct child vibe replies (Threads-style), not post_comments */
  repliesCount: number;
}

export interface VibePage {
  rows: VibePost[];
  nextCursor: string | null;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CreateVibePollInput {
  options: string[];
}

export interface CreateVibeInput extends CreatePostInput {
  /** Parent vibe public UUID — creates a reply in that thread */
  parentId?: string;
  poll?: CreateVibePollInput;
}

export interface VibeThreadPage {
  root: VibePost;
  replies: VibePost[];
  nextCursor: string | null;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface VibePollVoter {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  selectedOption: { id: string; text: string };
  votedAt: string;
}

export interface VibePollVotersPage {
  rows: VibePollVoter[];
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Default vibe TTL in hours (24h Threads-style). */
export const VIBE_EXPIRATION_HOURS = 24;

/** Age (createdAt + 24h) or explicit `expiredAt` — same rule for lists, GET, and engagement. */
export function isVibeExpired(opts: {
  createdAt: Date | string;
  expiredAt: Date | string | null;
}): boolean {
  const createdMs = new Date(opts.createdAt).getTime();
  const ageExpired =
    Number.isFinite(createdMs) &&
    createdMs <= Date.now() - VIBE_EXPIRATION_HOURS * 60 * 60 * 1000;
  const ttlExpired =
    opts.expiredAt != null && new Date(opts.expiredAt).getTime() <= Date.now();
  return ageExpired || ttlExpired;
}
