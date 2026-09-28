import { Redis } from '@upstash/redis';
import { env } from './env.js';

/**
 * Upstash Redis Client Configuration
 * 
 * WHY: We use Upstash Redis over REST for instant revocation checks. When an owner
 * hits "Revoke Access", the token's unique ID (`jti`) is added to Redis with a TTL
 * matching the token's remaining lifespan. Because Redis is sub-millisecond, revocation
 * takes effect globally before database queries even start.
 * 
 * SECURITY MANDATE (FAIL-CLOSED):
 * If Redis is unreachable during an access check, we MUST FAIL CLOSED (deny access).
 * Failing open would allow revoked tokens to slip through if an attacker DDOSed Redis.
 */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export async function pingRedis() {
  try {
    const pong = await redis.ping();
    console.log(`[Redis] Upstash Redis connected successfully: ${pong}`);
    return true;
  } catch (error) {
    console.error(`[Redis Error] Failed to ping Upstash Redis: ${error.message}`);
    return false;
  }
}
