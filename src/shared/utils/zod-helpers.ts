import { z } from 'zod';

/** Treat `""` as omitted for optional string fields (common client habit). */
export function emptyAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema);
}

/** Optional UUID; `""` → undefined */
export const optionalUuidSchema = emptyAsUndefined(z.string().uuid().optional());

/** UUID or null; `""` → null (clear field) */
export const nullableUuidSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().uuid().nullable().optional(),
);

/** UUID array; drops empty strings from the list */
export const uuidArraySchema = (opts?: { max?: number }) => {
  let arr = z.array(z.string().uuid());
  if (opts?.max != null) arr = arr.max(opts.max);
  return z.preprocess((v) => {
    if (!Array.isArray(v)) return v;
    return v.filter((x) => x !== '');
  }, arr.optional());
};
