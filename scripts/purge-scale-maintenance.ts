/**
 * One-shot / cron-friendly purge (no app cache).
 * Usage: npx tsx scripts/purge-scale-maintenance.ts
 */
import 'dotenv/config';
import { UserFeedService } from '../src/modules/user-feed/user-feed.service.js';
import { destroyDb } from '../src/shared/database/index.js';

async function main() {
  const svc = new UserFeedService();
  const result = await svc.runMaintenance();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...result }));
  await destroyDb();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  try {
    await destroyDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
