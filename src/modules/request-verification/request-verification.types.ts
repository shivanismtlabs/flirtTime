export const VERIFICATION_STATUSES = [
  'Submitted',
  'Viewed',
  'Approved',
  'Rejected',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const LINK_TYPES = [
  { code: 'social_media', name: 'Social media' },
  { code: 'news_article', name: 'News article' },
  { code: 'other', name: 'other' },
] as const;
export type LinkTypeCode = (typeof LINK_TYPES)[number]['code'];

export const DOCUMENT_TYPES = [
  { code: 'driving_license', name: "Driver's license" },
  { code: 'passport', name: 'Passport' },
  { code: 'national_id_card', name: 'National identification card' },
  { code: 'tax_filing', name: 'Tax filing' },
  { code: 'utility_bill', name: 'Recent utility bill' },
  { code: 'articles_of_incorporation', name: 'Articles of incorporation' },
] as const;
export type DocumentTypeCode = (typeof DOCUMENT_TYPES)[number]['code'];

export const CATEGORIES = [
  { code: '00', name: 'News/media' },
  { code: '01', name: 'Sports' },
  { code: '02', name: 'Government and politics' },
  { code: '03', name: 'Music' },
  { code: '04', name: 'Fashion' },
  { code: '05', name: 'Entertainment' },
] as const;
export type CategoryCode = (typeof CATEGORIES)[number]['code'];

export type VerificationOption = { code: string; name: string };

export type VerificationLink = {
  type: string;
  url: string;
};

export type RequestVerification = {
  id: string;
  fullName: string;
  documentType: string;
  documentUrl: string;
  category: string;
  nationality: { code: string; name: string };
  audience: string | null;
  alsoKnownAs: string | null;
  links: VerificationLink[];
  status: VerificationStatus | string;
  comments: string | null;
  submittedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminRequestVerification = RequestVerification & {
  approvedBy: string | null;
  rejectedBy: string | null;
  user: {
    id: string;
    email: string | null;
    username: string | null;
    fullName: string | null;
    isVerified: boolean;
  };
};

export type CreateRequestVerificationInput = {
  fullName: string;
  documentUrl: string;
  documentType: string;
  category: string;
  nationality: { code: string; name: string; label?: string };
  audience?: string;
  alsoKnownAs?: string;
  links?: VerificationLink[];
};

export type VerificationOptions = {
  documentTypes: VerificationOption[];
  categories: VerificationOption[];
  linkTypes: VerificationOption[];
};
