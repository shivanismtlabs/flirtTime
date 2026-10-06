export const HELP_REQUEST_TYPES = [
  'wallet',
  'reels',
  'search',
  'setting',
  'notification',
  'followers_following',
  'other',
] as const;

export type HelpRequestType = (typeof HELP_REQUEST_TYPES)[number];

export interface HelpRequestOption {
  label: string;
  value: HelpRequestType;
}

export interface HelpRequest {
  id: string;
  name: string;
  mobile: string;
  email: string;
  type: HelpRequestType | string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHelpRequestInput {
  name: string;
  mobile: string;
  email: string;
  type: HelpRequestType;
  description: string;
}

export interface UpdateHelpRequestInput {
  name?: string;
  mobile?: string;
  email?: string;
  type?: HelpRequestType;
  description?: string;
}

export interface HelpRequestsPage {
  rows: HelpRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const HELP_REQUEST_OPTIONS: HelpRequestOption[] = [
  { label: 'Wallet', value: 'wallet' },
  { label: 'Reels', value: 'reels' },
  { label: 'Search', value: 'search' },
  { label: 'Settings', value: 'setting' },
  { label: 'Notifications', value: 'notification' },
  { label: 'Followers & Following', value: 'followers_following' },
  { label: 'Other', value: 'other' },
];
