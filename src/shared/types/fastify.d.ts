import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Request start marker for responseTime (perf.now) */
    _t0?: number;
    user?: {
      sub: string;
      email?: string;
      username?: string;
      role?: string;
      kind?: 'user' | 'admin';
      jti?: string;
      exp?: number;
      type?: 'access' | 'refresh';
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      email?: string;
      username?: string;
      role?: string;
      kind?: 'user' | 'admin';
      type?: 'access' | 'refresh';
      jti?: string;
      exp?: number;
    };
    user: {
      sub: string;
      email?: string;
      username?: string;
      role?: string;
      kind?: 'user' | 'admin';
      type?: 'access' | 'refresh';
      jti?: string;
      exp?: number;
    };
  }
}
