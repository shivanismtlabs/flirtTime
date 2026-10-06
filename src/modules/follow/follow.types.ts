export type FollowEdgeStatus = 'follow' | 'requested';

export interface FollowUser {
  id: string;
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  isVerified: boolean;
  followedAt: string;
  relationship: {
    isFollowing: boolean;
    isFollowedBy: boolean;
    isRequestedByMe: boolean;
    isRequestedToMe: boolean;
    isBlocked: boolean;
    blockedByOwner: boolean;
    isSelf: boolean;
  };
}

export interface FollowEdge {
  followerId: string;
  followingId: string;
  status: FollowEdgeStatus;
  createdAt: string;
  requestedAt: string | null;
  followedAt: string | null;
}

export interface FollowCounts {
  followerCount: number;
  followingCount: number;
  postCount: number;
}

export interface FollowStatus {
  isFollowing: boolean;
  isFollowedBy: boolean;
  /** Viewer sent a pending request to this user */
  isRequestedByMe: boolean;
  /** This user sent a pending request to the viewer */
  isRequestedToMe: boolean;
  /** Viewer blocked this user */
  isBlocked: boolean;
  /** This user blocked the viewer */
  blockedByOwner: boolean;
}

export interface FollowRelationshipFlags extends FollowStatus {
  isSelf: boolean;
}

export interface FollowUsersPage {
  rows: FollowUser[];
  nextCursor: string | null;
  limit: number;
}
