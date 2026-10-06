export interface Story {
  id: string;
  uuid: string;
  userId: string;
  caption: string | null;
  filePath: string;
  fileType: 'image' | 'video';
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateStoryInput {
  caption?: string;
  filePath: string;
  fileType: 'image' | 'video';
  thumbnail?: string;
  privacy?: 'public' | 'followers' | 'close_friends';
  meta?: Record<string, unknown>;
  enableLikes?: boolean;
  enableReplies?: boolean;
}
