import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  langFromRequest,
  LookupService,
  resolveListLang,
} from './lookup.service.js';

function headerString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export class LookupController {
  constructor(private readonly service = new LookupService()) {}

  private async langFrom(request: FastifyRequest): Promise<string> {
    return langFromRequest(request);
  }

  private countryFilterFrom(request: FastifyRequest): {
    isNewCountryVisible?: boolean;
  } {
    const query = request.query as {
      is_new_country_visible?: boolean;
      newCountry?: boolean;
    };
    const value =
      query.is_new_country_visible !== undefined
        ? query.is_new_country_visible
        : query.newCountry;
    return value === undefined ? {} : { isNewCountryVisible: value };
  }

  private cacheHeaders(reply: FastifyReply, privateCache = false) {
    reply.header(
      'Cache-Control',
      privateCache
        ? 'private, max-age=300'
        : 'public, max-age=7200',
    );
    reply.header('Vary', 'Accept-Language, version, Authorization');
  }

  nationalityList = async (request: FastifyRequest, reply: FastifyReply) => {
    const lang = await this.langFrom(request);
    this.cacheHeaders(reply, Boolean(request.user?.sub));
    const data = await this.service.getNationalityList(
      lang,
      this.countryFilterFrom(request),
    );
    return reply.send(data);
  };

  countryList = async (request: FastifyRequest, reply: FastifyReply) => {
    const lang = await this.langFrom(request);
    this.cacheHeaders(reply, Boolean(request.user?.sub));
    const data = await this.service.getCountryList(
      lang,
      this.countryFilterFrom(request),
    );
    return reply.send(data);
  };

  professionList = async (request: FastifyRequest, reply: FastifyReply) => {
    this.cacheHeaders(reply);
    const data = this.service.getProfessionList(await this.langFrom(request));
    return reply.send(data);
  };

  genderList = async (request: FastifyRequest, reply: FastifyReply) => {
    this.cacheHeaders(reply);
    const query = request.query as { version?: string };
    const versionHeader = headerString(request.headers.version);
    const acceptLanguage = headerString(request.headers['accept-language']);
    // Linkgram: if no lang hint at all, return full multilingual map
    const hasHint = Boolean(query.version || versionHeader || acceptLanguage);
    const lang = hasHint
      ? resolveListLang({
          versionQuery: query.version,
          versionHeader,
          acceptLanguage,
        })
      : null;
    const data = this.service.getGenderList(lang);
    return reply.send(data);
  };
}
