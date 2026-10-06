import { Redis } from 'ioredis';
import { env, getRedisConnection } from '../config/index.js';
import { status } from '../logger/index.js';

let redis: Redis | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

export function isRedisEnabled(): boolean {
  return env.REDIS_ENABLED;
}

function redisTarget(): string {
  return `${env.REDIS_HOST}:${env.REDIS_PORT}/${env.REDIS_DB}`;
}

function attachQuietErrorHandler(client: Redis): void {
  // Avoid noisy reconnect spam; boot/connect paths own the ✓/✗ logs
  client.on('error', () => {
    // intentionally quiet — surfaced via connectRedis / adapter setup
  });
}

export function getRedis(): Redis {
  if (!env.REDIS_ENABLED) {
    throw new Error('Redis is disabled (REDIS_ENABLED=false)');
  }

  if (!redis) {
    redis = new Redis(
      getRedisConnection({
        keyPrefix: env.REDIS_KEY_PREFIX,
      }),
    );
    attachQuietErrorHandler(redis);
  }

  return redis;
}

/** Dedicated connections for Socket.IO Redis adapter (no keyPrefix). */
export function getRedisPubSub(): { pub: Redis; sub: Redis } {
  if (!env.REDIS_ENABLED) {
    throw new Error('Redis is disabled (REDIS_ENABLED=false)');
  }

  if (!redisPub || !redisSub) {
    const base = getRedisConnection();
    redisPub = new Redis(base);
    redisSub = new Redis(base);
    attachQuietErrorHandler(redisPub);
    attachQuietErrorHandler(redisSub);
  }

  return { pub: redisPub, sub: redisSub };
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_ENABLED) {
    status.skip('Redis', 'disabled (REDIS_ENABLED=false)');
    return;
  }

  const target = redisTarget();
  const client = getRedis();

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    await client.ping();
    status.ok('Redis', target);
  } catch (err) {
    client.disconnect();
    redis = null;
    const message = err instanceof Error ? err.message : 'connection failed';
    status.fail('Redis', `${target} — ${message}`);
    throw err;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redis && !redisPub && !redisSub) {
    return;
  }

  const close = async (client: Redis | null) => {
    if (client) {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  };

  await Promise.all([close(redis), close(redisPub), close(redisSub)]);
  redis = null;
  redisPub = null;
  redisSub = null;
  status.ok('Redis', 'disconnected');
}

export function cacheKey(...parts: Array<string | number>): string {
  return parts.join(':');
}
