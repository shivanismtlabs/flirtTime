import type { FastifyReply, FastifyRequest } from 'fastify';
import { localizeResponse } from '../lookup/lookup.service.js';
import { UserService } from '../user/user.service.js';
import { AuthMessages } from './auth.messages.js';
import { AuthService } from './auth.service.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  SendOtpInput,
  SocialLinkInput,
  SocialLoginInput,
  SocialProvider,
  SocialRegisterInput,
  VerifyOtpInput,
} from './auth.types.js';

function rawBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export class AuthController {
  constructor(
    private readonly service = new AuthService(),
    private readonly users = new UserService(),
  ) {}

  private tokenSigner(request: FastifyRequest) {
    return {
      signAccessToken: (payload: {
        sub: string
        email?: string
        username?: string
        role?: string
        jti?: string
      }) =>
        request.server.jwt.sign({
          ...payload,
          type: 'access' as const,
          jti: payload.jti,
        }),
      signRefreshToken: (payload: {
        sub: string
        email?: string
        username?: string
        role?: string
      }) => request.server.signRefreshToken(payload),
      verifyRefreshToken: (token: string) =>
        request.server.verifyRefreshToken(token),
    };
  }

  sendOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.sendOtp(
      request.body as SendOtpInput,
      request.user?.sub,
    );
    return reply.code(200).send(result);
  };

  resendOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.resendOtp(
      request.body as SendOtpInput,
      request.user?.sub,
    );
    return reply.code(200).send(result);
  };

  verifyOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.verifyOtp(
      request.body as VerifyOtpInput,
      request.user?.sub,
    );
    return reply.send(result);
  };

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.register(
      request.body as RegisterInput,
      this.tokenSigner(request),
    );
    return reply.code(201).send(
      await localizeResponse(request, {
        ...result,
        message: AuthMessages.accountCreated,
      }),
    );
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as LoginInput;
    const deviceId =
      body.deviceId?.trim() ||
      (typeof request.headers['x-device-id'] === 'string'
        ? request.headers['x-device-id'].trim()
        : undefined);
    const result = await this.service.login(
      { ...body, deviceId: deviceId || undefined },
      this.tokenSigner(request),
    );
    return reply.send(await localizeResponse(request, result));
  };

  socialLogin = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as SocialLoginInput;
    const deviceId =
      body.deviceId?.trim() ||
      (typeof request.headers['x-device-id'] === 'string'
        ? request.headers['x-device-id'].trim()
        : undefined);
    const result = await this.service.socialLogin(
      { ...body, deviceId: deviceId || undefined },
      this.tokenSigner(request),
    );
    return reply.send(await localizeResponse(request, result));
  };

  socialRegister = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.socialRegister(
      request.body as SocialRegisterInput,
      this.tokenSigner(request),
    );
    return reply.code(201).send(
      await localizeResponse(request, {
        ...result,
        message: AuthMessages.accountCreated,
      }),
    );
  };

  socialLink = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.socialLink(
      request.user!.sub,
      request.body as SocialLinkInput,
    );
    return reply.send(result);
  };

  socialUnlink = async (request: FastifyRequest, reply: FastifyReply) => {
    const { provider } = request.params as { provider: SocialProvider };
    const result = await this.service.socialUnlink(request.user!.sub, provider);
    return reply.send(result);
  };

  listSocialProviders = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.listSocialProviders(request.user!.sub);
    return reply.send(result);
  };

  checkUsername = async (request: FastifyRequest, reply: FastifyReply) => {
    const { username } = request.query as { username: string };
    const result = await this.service.checkUsernameAvailable(username);
    return reply.send(result);
  };

  checkEmailAvailable = async (request: FastifyRequest, reply: FastifyReply) => {
    const { email } = request.body as { email: string };
    const result = await this.service.checkEmailAvailable(email);
    return reply.send(result);
  };

  checkPhoneAvailable = async (request: FastifyRequest, reply: FastifyReply) => {
    const { countryCode, phoneNumber } = request.body as {
      countryCode: string;
      phoneNumber: string;
    };
    const result = await this.service.checkPhoneAvailable(countryCode, phoneNumber);
    return reply.send(result);
  };

  forgotPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.service.forgotPassword(
      request.body as ForgotPasswordInput,
    );
    return reply.send(result);
  };

  resetPassword = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.resetPassword(request.body as ResetPasswordInput);
    return reply.send({
      reset: true as const,
      message: AuthMessages.passwordUpdated,
    });
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const tokens = await this.service.refresh(
      request.body as RefreshInput,
      this.tokenSigner(request),
    );
    return reply.send({ tokens });
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as LogoutInput;
    const raw = rawBearerToken(request);
    // jwtVerify already ran in preHandler; re-decode claims for jti/exp.
    const claims = request.user as {
      sub: string
      jti?: string
      exp?: number
    };
    let jti = claims?.jti;
    let exp = claims?.exp;
    if (raw && (!jti || exp == null)) {
      try {
        const decoded = request.server.jwt.decode<{
          jti?: string
          exp?: number
        }>(raw);
        if (decoded && typeof decoded === 'object') {
          jti = jti ?? decoded.jti;
          exp = exp ?? decoded.exp;
        }
      } catch {
        // denylist still hashes the raw token
      }
    }

    const result = await this.service.logout(
      request.user!.sub,
      body,
      { rawToken: raw, jti, exp },
      this.tokenSigner(request),
    );
    return reply.send(result);
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await this.users.getMe(request.user!.sub);
    return reply.send(await localizeResponse(request, { user }));
  };
}
