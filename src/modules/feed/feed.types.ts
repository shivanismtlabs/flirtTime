export interface FeedMediaItem {
  id: string;
  url: string;
  thumbnail: string | null;
  fileType: 'image' | 'video';
  position: number;
  meta: unknown;
  /** True when url points at HLS master.m3u8 */
  isHls?: boolean;
  isStreamAvailable?: boolean;
}

export interface FeedAuthor {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  /** Verified profile badge */
  isVerified: boolean;
  /** Viewer follows this author (accepted) */
  isFollowing: boolean;
  /** Author (post owner) follows the viewer (accepted) */
  isOwnerFollowingVisitor: boolean;
  /** Viewer has a pending follow request to this author */
  isRequestedByMe: boolean;
}

export interface FeedStats {
  likes: number;
  comments: number;
  dislikes: number;
  shares: number;
  views: number;
  reposts: number;
  gifts: number;
  saves: number;
}

/** Viewer-specific state — computed from action tables (not stored on posts) */
export interface FeedFlags {
  isLiked: boolean;
  isDisliked: boolean;
  isSaved: boolean;
  isReposted: boolean;
  hasShared: boolean;
  hasGifted: boolean;
  hasViewed: boolean;
  /** Viewer has an active report on this post */
  isReported: boolean;
  /**
   * Viewer is allowed to post a comment now.
   * Combines post `enableComments` + author comment_settings + follow relationship.
   * Use this to show/hide the comment text box.
   */
  canComment: boolean;
}

export interface FeedTaggedUser {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
}

export interface FeedPost {
  id: string;
  caption: string | null;
  type: string;
  privacy: string;
  lang: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  enableComments: boolean;
  enableLikes: boolean;
  isPinned: boolean;
  pinnedAt: string | null;
  createdAt: string;
  /** HTTPS Universal Link for copy/share (opens app or store landing) */
  shareLink: string | null;
  user: FeedAuthor;
  taggedUsers: FeedTaggedUser[];
  media: FeedMediaItem[];
  stats: FeedStats;
  flags: FeedFlags;
}

export interface FeedPage {
  rows: FeedPost[];
  nextCursor: string | null;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CreatePostInput {
  caption?: string;
  lang?: string;
  mediaIds?: string[];
  latitude?: number;
  longitude?: number;
  location?: string;
  taggedUserIds?: string[];
}

export interface UpdatePostInput {
  caption?: string | null;
  lang?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: string | null;
  taggedUserIds?: string[];
}

export interface PostSettingsInput {
  enableLikes?: boolean;
  enableComments?: boolean;
}

export interface CreateCommentInput {
  body: string;
  parentId?: string;
  lang?: string;
}

export interface ReportPostInput {
  reason?: string;
  details?: string;
}

export interface ReportResult {
  reported: true;
  created: boolean;
  id: string;
  reason: string | null;
  details: string | null;
}

export interface UnreportResult {
  reported: false;
  /** True when an active report was soft-deleted this call */
  removed: boolean;
}

export interface FeedLiker {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  likedAt: string;
}

export interface FeedCommentAuthor {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
}

export interface FeedComment {
  id: string;
  body: string;
  /** Comment body language (default en) */
  lang: string;
  parentId: string | null;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  /** Viewer liked this comment (when authenticated) */
  likedByMe: boolean;
  user: FeedCommentAuthor;
}

export interface FeedLikersPage {
  rows: FeedLiker[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FeedReportRow {
  id: string;
  reason: string | null;
  details: string | null;
  status: string;
  reportedAt: string;
  user: {
    id: string;
    username: string;
    fullName: string | null;
    profilePicture: string | null;
    isVerified: boolean;
  };
}

export interface FeedReportsPage {
  rows: FeedReportRow[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FeedViewer {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  viewedAt: string;
}

export interface FeedViewersPage {
  rows: FeedViewer[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FeedCommentsPage {
  rows: FeedComment[];
  page: number;
  limit: number;
  hasMore: boolean;
  /** Live post comment count (top-level + replies) */
  commentCount: number;
}

export interface LikeResult {
  liked: boolean;
  likesCount: number;
  /** True only when a new like edge was created/restored this call */
  created: boolean;
}

/** Stored in post_gifts.gift_type — catalog title, uuid, or legacy slug */
export type GiftType = string;

export interface SendGiftInput {
  giftId?: number;
  giftType?: GiftType;
  quantity?: number;
}

export interface GiftResult {
  id: string;
  giftType: GiftType;
  quantity: number;
  giftsCount: number;
  /** Coins charged from sender available balance */
  coinsSpent: number;
  /** Sender available balance after gift */
  balance: number;
}

export const SHARE_CHANNELS = ['external', 'dm', 'story', 'copy_link'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export interface SharePostInput {
  channel?: ShareChannel;
  /** When set, DM the post card to each user and record a share + owner notify per success */
  userIds?: string[];
}

export interface ShareDeliveredItem {
  userId: string;
  conversationId: string;
  messageId: string;
}

export interface ShareFailedItem {
  userId: string;
  reason: string;
}

export interface ShareResult {
  shared: boolean;
  sharesCount: number;
  channel: ShareChannel;
  /** Present when `userIds` was provided */
  delivered?: ShareDeliveredItem[];
  failed?: ShareFailedItem[];
}

export interface ViewResult {
  viewed: true;
  /** True only when a new unique view row was created this call */
  created: boolean;
  viewsCount: number;
}

export interface SaveResult {
  saved: boolean;
  savesCount: number;
  created: boolean;
}
