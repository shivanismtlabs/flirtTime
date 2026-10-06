import type {
  FastifySchemaCompiler,
  FastifySerializerCompiler,
  FastifyTypeProvider,
} from 'fastify';
import type { ZodTypeAny, ZodError, input, output } from 'zod';
import { ValidationError } from '../errors/index.js';

export interface ZodTypeProvider extends FastifyTypeProvider {
  validator: this['schema'] extends ZodTypeAny ? output<this['schema']> : unknown;
  serializer: this['schema'] extends ZodTypeAny ? input<this['schema']> : unknown;
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function summarizeZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Request validation failed';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

export const zodValidatorCompiler: FastifySchemaCompiler<ZodTypeAny> = ({ schema }) => {
  return (data) => {
    const result = schema.safeParse(data);

    if (result.success) {
      return { value: result.data };
    }

    return {
      error: new ValidationError(
        summarizeZodError(result.error),
        formatZodError(result.error),
      ),
    };
  };
};

/**
 * Fastify's default serializer treats `response` schemas as JSON Schema (AJV).
 * Call routes pass Zod objects for OpenAPI docs — without this compiler, boot fails
 * with: `schema isinvalid: data/required must be array`.
 *
 * Response shapes are documentation-only; serialize without stripping fields.
 */
export const zodSerializerCompiler: FastifySerializerCompiler<unknown> = () => {
  return (data) => {
    if (typeof data === 'string') return data;
    return JSON.stringify(data ?? null);
  };
};
