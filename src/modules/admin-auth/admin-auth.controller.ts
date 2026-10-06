import type { FastifyReply, FastifyRequest } from 'fastify';
import { revokeAccessToken } from '../../shared/auth/index.js';
import type {
  AdminAssignRolesInput,
  AdminBootstrapInput,
  AdminChangePasswordInput,
  AdminCreateInput,
  AdminLoginInput,
  AdminLogoutInput,
  AdminRefreshInput,
} from './admin-auth.schema.js';
import { AdminAuthService } from './admin-auth.service.js';

export class AdminAuthController {
  constructor(private readonly service = new AdminAuthService()) {}

  private signer(request: FastifyRequest) {
    return {
      signAccessToken: (payload: {
        sub: string;
        email?: string;
        role?: string;
        kind?: 'admin';
      }) => request.server.jwt.sign({ ...payload, type: 'access' as const }),
      signRefreshToken: (payload: {
        sub: string;
        email?: string;
        role?: string;
        kind?: 'admin';
      }) => request.server.signRefreshToken(payload),
      verifyRefreshToken: (token: string) =>
        request.server.verifyRefreshToken(token),
    };
  }

  private requestMeta(request: FastifyRequest) {
    return {
      userAgent: request.headers['user-agent'] ?? null,
      ipAddress: request.ip ?? null,
    };
  }

  bootstrap = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminBootstrapInput;
    const data = await this.service.bootstrap(
      body,
      this.signer(request),
      this.requestMeta(request),
    );
    return reply.code(201).send(data);
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminLoginInput;
    const data = await this.service.login(
      body,
      this.signer(request),
      this.requestMeta(request),
    );
    return reply.send(data);
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminRefreshInput;
    const tokens = await this.service.refresh(
      body,
      this.signer(request),
      this.requestMeta(request),
    );
    return reply.send({ tokens });
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as AdminLogoutInput;
    const raw = this.rawBearerToken(request);
    // authenticateAdmin's preHandler already verified the JWT and put
    // jti/exp on request.user — reuse it instead of re-decoding.
    await revokeAccessToken(
      { jti: request.user!.jti, exp: request.user!.exp },
      raw,
    );

    const result = await this.service.logout(
      request.user!.sub,
      body,
      this.signer(request),
    );
    return reply.send(result);
  };

  private rawBearerToken(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
  }

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const admin = await this.service.me(request.user!.sub);
    return reply.send({ admin });
  };

  changePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminChangePasswordInput;
    await this.service.changePassword(request.user!.sub, body);
    return reply.send({ changed: true });
  };

  listAdmins = async (_request: FastifyRequest, reply: FastifyReply) => {
    const admins = await this.service.listAdmins();
    return reply.send({ admins });
  };

  createAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as AdminCreateInput;
    const admin = await this.service.createAdmin(request.user!.sub, body);
    return reply.code(201).send({ admin });
  };

  assignRoles = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AdminAssignRolesInput;
    const admin = await this.service.assignRoles(request.user!.sub, id, body);
    return reply.send({ admin });
  };

  listRoles = async (_request: FastifyRequest, reply: FastifyReply) => {
    const roles = await this.service.listRoles();
    return reply.send({ roles });
  };

  listPermissions = async (_request: FastifyRequest, reply: FastifyReply) => {
    const permissions = await this.service.listPermissions();
    return reply.send({ permissions });
  };
}
