export type AdminStatus = 'active' | 'suspended' | 'invited';

export type AdminPublic = {
  id: string;
  email: string;
  fullName: string;
  status: AdminStatus;
  roles: Array<{ key: string; name: string }>;
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
};

export type AdminTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export type AdminTokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  kind?: 'user' | 'admin';
  type?: 'access' | 'refresh';
  jti?: string;
  exp?: number;
};

export type AdminTokenSigner = {
  signAccessToken(payload: {
    sub: string;
    email?: string;
    role?: string;
    kind?: 'admin';
  }): string;
  signRefreshToken(payload: {
    sub: string;
    email?: string;
    role?: string;
    kind?: 'admin';
  }): string;
  verifyRefreshToken(token: string): AdminTokenPayload;
};
