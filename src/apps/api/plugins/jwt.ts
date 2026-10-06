import { randomUUID } from 'node:crypto';
import fjwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../../../shared/config/index.js';

type JwtPayload = {
  sub: string;
  email?: string;
  username?: string;
  role?: string;
  kind?: 'user' | 'admin';
  type?: 'access' | 'refresh';
  jti?: string;
  exp?: number;
};

async function jwtPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fjwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    },
  });

  app.decorate('signRefreshToken', (payload: JwtPayload) => {
    return app.jwt.sign(
      { ...payload, type: 'refresh', jti: payload.jti ?? randomUUID() },
      {
        key: env.JWT_REFRESH_SECRET,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      },
    );
  });

  app.decorate('verifyRefreshToken', (token: string): JwtPayload => {
    return app.jwt.verify<JwtPayload>(token, {
      key: env.JWT_REFRESH_SECRET,
    });
  });
}

export default fp(jwtPlugin, { name: 'jwt' });

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    signRefreshToken(payload: {
      sub: string;
      email?: string;
      username?: string;
      role?: string;
      kind?: 'user' | 'admin';
      jti?: string;
    }): string;
    verifyRefreshToken(token: string): JwtPayload;
  }
}
