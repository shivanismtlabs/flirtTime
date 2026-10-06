export type DashboardFilters = {
  range: '7d' | '30d' | '90d' | 'all';
  gender?: 'Male' | 'Female' | 'Other';
  contentType?: 'post' | 'reel' | 'vibe';
  verified?: boolean;
};

export type StatusCount = {
  status: string;
  count: number;
};

export type OrderStatusStat = {
  status: string;
  count: number;
  usdCent: number;
  coinsGranted: number;
};

export type DashboardFeedItem = {
  id: string;
  type: string;
  caption: string | null;
  authorUsername: string | null;
  likes: number;
  comments: number;
  views: number;
  createdAt: string;
};

export type DashboardRecentUser = {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string;
  status: string;
  createdAt: string;
};

export type DashboardRecentWithdrawal = {
  id: string;
  status: string;
  coins: number;
  username: string | null;
  createdAt: string;
};

export type DashboardRecentReport = {
  id: string;
  kind: 'user' | 'post';
  status: string;
  reason: string | null;
  createdAt: string;
};

export type DashboardActivityItem = {
  id: string;
  type:
    | 'user'
    | 'post'
    | 'report'
    | 'withdrawal'
    | 'verification'
    | 'moderation';
  label: string;
  at: string;
  href?: string;
};

export type DashboardOverview = {
  filters: DashboardFilters & {
    from: string | null;
    to: string;
  };
  users: {
    total: number;
    active: number;
    online: number;
    newToday: number;
    newInRange: number;
    verified: number;
    privateProfiles: number;
    byGender: Array<{ gender: string; count: number }>;
    byStatus: StatusCount[];
    byPlatform: Array<{ platform: string; count: number }>;
    byCountry: Array<{ country: string; count: number }>;
  };
  content: {
    posts: number;
    reels: number;
    vibes: number;
    newInRange: number;
    stories: number;
    totalPublished: number;
    commentsTotal: number;
    byType: Array<{ type: string; count: number }>;
  };
  messaging: {
    conversations: number;
    groups: number;
  };
  engagement: {
    likesInRange: number;
    commentsInRange: number;
    followsInRange: number;
    totalFollows: number;
    sharesInRange: number;
    savesInRange: number;
    viewsInRange: number;
    giftsInRange: number;
    repostsInRange: number;
    followsByStatus: StatusCount[];
  };
  engagementToday: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    views: number;
  };
  revenue: {
    usdCentInRange: number;
    usdCentToday: number;
    usdCentAllTime: number;
    coinsGrantedInRange: number;
    ordersInRange: number;
    byStatus: OrderStatusStat[];
  };
  moderation: {
    openUserReports: number;
    openPostReports: number;
    pendingVerifications: number;
    userReportsByStatus: StatusCount[];
    postReportsByStatus: StatusCount[];
    verificationsByStatus: StatusCount[];
  };
  wallet: {
    totalBalance: number;
    pendingWithdrawals: number;
    byStatus: StatusCount[];
  };
  topHashtags: Array<{ name: string; postCount: number }>;
  recentUsers: DashboardRecentUser[];
  recentWithdrawals: DashboardRecentWithdrawal[];
  recentReports: DashboardRecentReport[];
  activity: DashboardActivityItem[];
  recentFeed: DashboardFeedItem[];
  series: {
    signups: Array<{ date: string; count: number }>;
    content: Array<{ date: string; count: number }>;
    revenue: Array<{ date: string; count: number }>;
  };
};
