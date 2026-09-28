import { redis } from '../config/redis.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Redis Token Blacklist Service
 * 
 * WHY:
 * JWTs are stateless and cannot be revoked by default without changing the secret.
 * By keeping a distributed Redis blacklist indexed by `revoked:<jti>`, revocation takes
 * effect instantaneously across all edge servers.
 * 
 * FAIL-CLOSED SECURITY PRINCIPLE:
 * If Redis is down or unreachable during `isBlacklisted`, we FAIL CLOSED. We reject
 * the access request rather than allowing potentially revoked links to be viewed.
 */

/**
 * Places a token `jti` into the Redis blacklist with a TTL matching the token's remaining lifetime.
 * Once the token reaches its original expiration date, Redis automatically frees the memory.
 */
export async function blacklistToken(jti, ttlSeconds) {
  if (!jti) return;
  // Enforce a minimum 60s TTL just in case calculation was 0 or negative
  const safeTtl = Math.max(60, Math.ceil(ttlSeconds || 3600));

  try {
    await redis.set(`revoked:${jti}`, '1', { ex: safeTtl });
    console.log(`[Blacklist] Token ${jti} blacklisted for ${safeTtl}s in Redis`);
  } catch (error) {
    console.error(`[Blacklist Error] Failed to set revoked:${jti} in Redis: ${error.message}`);
    // We do not throw here during revocation to ensure DB revocation can still commit,
    // but the DB status will still catch it.
  }
}

/**
 * Checks whether a token `jti` is blacklisted.
 * 
 * NOTE: Fails closed on Redis failure.
 */
export async function isBlacklisted(jti) {
  if (!jti) return false;

  try {
    const val = await redis.get(`revoked:${jti}`);
    return val !== null && val !== undefined;
  } catch (error) {
    console.error(`[Blacklist Critical] Redis unreachable during revocation check for ${jti}: ${error.message}`);
    // FAIL-CLOSED: Refuse access if revocation status cannot be verified
    throw ApiError.forbidden(
      'Security verification service temporarily unavailable. Access denied for protection.',
      'SECURITY_CHECK_UNAVAILABLE'
    );
  }
}
