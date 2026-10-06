export interface Reel {
  id: string;
  uuid: string;
  userId: string;
  caption: string | null;
  privacy: string;
  createdAt: Date;
}

export interface CreateReelInput {
  caption?: string;
  privacy?: 'public' | 'followers' | 'private';
  media: {
    filePath: string;
    fileType: 'image' | 'video';
    thumbnail?: string;
    meta?: Record<string, unknown>;
  };
}
