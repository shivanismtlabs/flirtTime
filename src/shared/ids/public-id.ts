import { randomUUID } from 'node:crypto';

/** Public UUID for API-facing rows (users.uuid, posts.uuid, …). */
export function newPublicId(): string {
  return randomUUID();
}
