import type { FastifyReply, FastifyRequest } from 'fastify';
import { localizeResponse } from '../lookup/lookup.service.js';
import { UserService } from './user.service.js';
import type { PeopleListFilters, UpdateProfileInput } from './user.types.js';

function asStringList(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v) => v && v.toLowerCase() !== 'all');
}

function peopleFiltersFromQuery(query: {
  q?: string;
  gender?: string;
  nationality?: string | string[];
  country?: string | string[];
  countries?: string | string[];
  profession?: string;
  ageMin?: number;
  ageMax?: number;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}): PeopleListFilters {
  const nationalities = [
    ...new Set([
      ...asStringList(query.nationality),
      ...asStringList(query.country),
      ...asStringList(query.countries),
    ]),
  ];

  const profession = query.profession?.trim();
  const ageMin = query.ageMin;
  const ageMax = query.ageMax;
  const ageIsAll =
    ageMin != null && ageMax != null && ageMin <= 18 && ageMax >= 99;

  return {
    q: query.q,
    gender:
      query.gender?.trim() && query.gender.trim().toLowerCase() !== 'all'
        ? query.gender
        : undefined,
    nationalities:
      nationalities.length > 0 && nationalities.length < 150
        ? nationalities
        : undefined,
    countries:
      nationalities.length > 0 && nationalities.length < 150
        ? nationalities
        : undefined,
    profession:
      profession && profession.toLowerCase() !== 'all' ? profession : undefined,
    ageMin: ageIsAll ? undefined : ageMin,
    ageMax: ageIsAll ? undefined : ageMax,
    latitude: query.latitude,
    longitude: query.longitude,
    radiusKm: query.radiusKm,
  };
}

export class UserController {
  constructor(private readonly service = new UserService()) {}

  private async send(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown,
  ) {
    return reply.send(await localizeResponse(request, payload));
  }

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await this.service.getMe(request.user!.sub);
    return this.send(request, reply, { user });
  };

  getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const viewerUuid = request.user?.sub;
    const user = await this.service.getById(id, viewerUuid);
    return this.send(request, reply, { user });
  };

  getByUsername = async (request: FastifyRequest, reply: FastifyReply) => {
    const { username } = request.params as { username: string };
    const viewerUuid = request.user?.sub;
    const user = await this.service.getByUsername(username, viewerUuid);
    return this.send(request, reply, { user });
  };

  updateMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;
    const user = await this.service.updateProfile(
      userId,
      request.body as UpdateProfileInput,
    );
    return this.send(request, reply, { user });
  };

  changeEmail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { verificationId } = request.body as { verificationId: string };
    const user = await this.service.applyChangeEmail(
      request.user!.sub,
      verificationId,
    );
    return this.send(request, reply, { user });
  };

  changePhone = async (request: FastifyRequest, reply: FastifyReply) => {
    const { verificationId } = request.body as { verificationId: string };
    const user = await this.service.applyChangePhone(
      request.user!.sub,
      verificationId,
    );
    return this.send(request, reply, { user });
  };

  deleteMe = async (request: FastifyRequest, reply: FastifyReply) => {
    const { password } = request.body as { password: string };
    const result = await this.service.deleteMe(request.user!.sub, password);
    return reply.send(result);
  };

  search = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      q?: string;
      gender?: string;
      nationality?: string | string[];
      country?: string | string[];
      countries?: string | string[];
      profession?: string;
      ageMin?: number;
      ageMax?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      page: number;
      limit: number;
    };
    const result = await this.service.search(
      peopleFiltersFromQuery(query),
      query.page,
      query.limit,
      request.user!.sub,
    );
    return this.send(request, reply, result);
  };

  discoverPeople = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      q?: string;
      gender?: string;
      nationality?: string | string[];
      profession?: string;
      ageMin?: number;
      ageMax?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
    };
    const result = await this.service.discoverPeople(
      request.user!.sub,
      peopleFiltersFromQuery(query),
      query.page,
      query.limit,
    );
    return this.send(request, reply, result);
  };

  suggestPeople = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      q?: string;
      gender?: string;
      nationality?: string | string[];
      profession?: string;
      ageMin?: number;
      ageMax?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
    };
    const result = await this.service.suggestPeople(
      request.user!.sub,
      peopleFiltersFromQuery(query),
      query.page,
      query.limit,
    );
    return this.send(request, reply, result);
  };

  listTaggable = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      q?: string;
      gender?: string;
      nationality?: string | string[];
      profession?: string;
      ageMin?: number;
      ageMax?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
    };
    const result = await this.service.listTaggable(
      request.user!.sub,
      peopleFiltersFromQuery(query),
      query.page,
      query.limit,
    );
    return this.send(request, reply, result);
  };

  /**
   * Same response shape as GET /users: `{ rows: UserProfile[], total }`.
   * Optional conversationId (group id) — excludes existing members; only when
   * actor is group admin (validated in ChatService helper).
   */
  listGroupCandidates = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page: number;
      limit: number;
      q?: string;
      gender?: string;
      nationality?: string | string[];
      profession?: string;
      ageMin?: number;
      ageMax?: number;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      conversationId?: string;
    };
    const result = await this.service.listGroupCandidates(
      request.user!.sub,
      peopleFiltersFromQuery(query),
      query.page,
      query.limit,
      query.conversationId,
    );
    return this.send(request, reply, result);
  };

  locationEnabledCount = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const data = await this.service.countLocationEnabled();
    return reply.send(data);
  };

  nearby = async (request: FastifyRequest, reply: FastifyReply) => {
    const {
      latitude,
      longitude,
      cityLatitude,
      cityLongitude,
      radiusKm,
      profession,
      gender,
      verified,
      limit,
    } = request.query as {
      latitude: number;
      longitude: number;
      cityLatitude?: number;
      cityLongitude?: number;
      radiusKm: number;
      profession?: string;
      gender?: 'MALE' | 'FEMALE';
      verified?: string;
      limit: number;
    };
    const result = await this.service.nearbyPeople(request.user!.sub, {
      latitude,
      longitude,
      cityLatitude,
      cityLongitude,
      radiusKm,
      profession,
      gender,
      verified: verified === 'true' || verified === '1',
      limit,
    });
    return this.send(request, reply, result);
  };

  listBlocked = async (request: FastifyRequest, reply: FastifyReply) => {
    const { page, limit } = request.query as { page: number; limit: number };
    const result = await this.service.listBlockedUsers(
      request.user!.sub,
      page,
      limit,
    );
    return this.send(request, reply, result);
  };

  block = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await this.service.blockUser(request.user!.sub, id);
    return reply.send(result);
  };

  unblock = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await this.service.unblockUser(request.user!.sub, id);
    return reply.code(204).send();
  };

  blockMany = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userIds } = request.body as { userIds: string[] };
    const result = await this.service.blockUsers(request.user!.sub, userIds);
    return reply.send(result);
  };

  unblockMany = async (request: FastifyRequest, reply: FastifyReply) => {
    const { userIds } = request.body as { userIds: string[] };
    const result = await this.service.unblockUsers(request.user!.sub, userIds);
    return reply.send(result);
  };
}
