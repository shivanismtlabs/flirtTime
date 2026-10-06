import type { Knex } from 'knex';

function toCount(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Live non-deleted comment count for a post, written back to `post_stats`. */
export async function recountPostComments(
  trx: Knex | Knex.Transaction,
  postId: string | number,
): Promise<number> {
  const row = await trx('post_comments')
    .where({ post_id: postId })
    .whereNull('deleted_at')
    .count<{ count: string | number }>('* as count')
    .first();
  const count = toCount(row?.count);

  await trx('post_stats')
    .insert({
      post_id: postId,
      comments_count: count,
    })
    .onConflict('post_id')
    .merge({
      comments_count: count,
      updated_at: trx.fn.now(),
    });

  return count;
}

/** Live non-deleted reply count for a parent comment. */
export async function recountCommentReplies(
  trx: Knex | Knex.Transaction,
  parentId: string | number,
): Promise<number> {
  const row = await trx('post_comments')
    .where({ parent_id: parentId })
    .whereNull('deleted_at')
    .count<{ count: string | number }>('* as count')
    .first();
  const count = toCount(row?.count);

  await trx('post_comments').where({ id: parentId }).update({
    replies_count: count,
    updated_at: trx.fn.now(),
  });

  return count;
}
