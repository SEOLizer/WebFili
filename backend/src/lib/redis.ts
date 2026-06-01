import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  try {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
    });
    redisClient.on('error', () => { redisClient = null; });
    return redisClient;
  } catch {
    return null;
  }
}

export async function setRefreshToken(userId: number, jti: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(`refresh:${userId}:${jti}`, '1', 'EX', 7 * 24 * 3600);
}

export async function validateRefreshToken(userId: number, jti: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // graceful degradation: skip Redis check if unavailable
  const val = await redis.get(`refresh:${userId}:${jti}`);
  return val === '1';
}

export async function revokeRefreshToken(userId: number, jti: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`refresh:${userId}:${jti}`);
}
