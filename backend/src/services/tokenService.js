import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { ApiError } from '../utils/ApiError.js';

// Pre-computed bcrypt hash of a dummy password to mitigate user enumeration via timing attacks
const DUMMY_HASH = '$2a$12$e80M1/UoWjWkZ6N0bH9n..2L9m4Q1yGzX0aN.dO7Y3L6F1bH0qG.y';

/**
 * SHA-256 Hash helper
 * WHY: We never store plaintext refresh tokens in the database.
 * If the database is compromised, an attacker cannot generate valid refresh sessions.
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a short-lived Access Token (15 minutes)
 * WHY: Short lifespan ensures that even if intercepted from memory/traffic,
 * the window of vulnerability is tightly constrained to 15 minutes.
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: '15m',
    }
  );
}

/**
 * Generates an opaque, cryptographically random Refresh Token (64 bytes hex)
 */
export function generateRawRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Creates and stores a new Refresh Token database record
 */
export async function createRefreshTokenRecord({ user, family = null, userAgent = '', ip = '' }) {
  const rawToken = generateRawRefreshToken();
  const tokenHash = hashToken(rawToken);
  const tokenFamily = family || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const record = await RefreshToken.create({
    user: user._id || user,
    tokenHash,
    family: tokenFamily,
    expiresAt,
    userAgent,
    ip,
  });

  return {
    rawToken,
    record,
  };
}

/**
 * Rotates an existing refresh token with REUSE DETECTION
 * 
 * WHY:
 * If an attacker steals a refresh token, they will attempt to exchange it for an access token.
 * If the legitimate user or attacker uses an already-rotated token, it triggers "Reuse Detection":
 * the entire token family (all sessions in this rotation chain) is instantly invalidated.
 */
export async function rotateRefreshToken(rawToken, { userAgent = '', ip = '' } = {}) {
  if (!rawToken) {
    throw ApiError.unauthorized('No refresh token provided', 'TOKEN_MISSING');
  }

  const tokenHash = hashToken(rawToken);
  const existingToken = await RefreshToken.findOne({ tokenHash });

  if (!existingToken) {
    throw ApiError.unauthorized('Invalid refresh token session', 'TOKEN_INVALID');
  }

  // REUSE DETECTION:
  // If the token presented was already revoked, someone is replaying an old token!
  if (existingToken.revoked) {
    console.warn(`[Security Alert] Refresh token reuse detected! Invalidating family: ${existingToken.family}`);
    await RefreshToken.updateMany({ family: existingToken.family }, { revoked: true });
    throw ApiError.unauthorized(
      'Suspicious session activity detected. All sessions in this chain have been terminated.',
      'TOKEN_REUSE_DETECTED'
    );
  }

  // Check if expired
  if (new Date() > existingToken.expiresAt) {
    existingToken.revoked = true;
    await existingToken.save();
    throw ApiError.unauthorized('Refresh token has expired. Please log in again.', 'TOKEN_EXPIRED');
  }

  // Issue new token in the same family
  const newRawToken = generateRawRefreshToken();
  const newTokenHash = hashToken(newRawToken);
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Invalidate old token with pointer to replacement
  existingToken.revoked = true;
  existingToken.replacedBy = newTokenHash;
  await existingToken.save();

  // Create new active record
  await RefreshToken.create({
    user: existingToken.user,
    tokenHash: newTokenHash,
    family: existingToken.family,
    expiresAt: newExpiresAt,
    userAgent,
    ip,
  });

  return {
    newRawToken,
    userId: existingToken.user,
  };
}

/**
 * Revokes a refresh token (e.g. on logout)
 */
export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await RefreshToken.updateOne({ tokenHash }, { revoked: true });
}

/**
 * Helper to generate secure refresh cookie configuration
 * 
 * WHY:
 * - `httpOnly: true`: JavaScript cannot read this cookie (mitigates XSS token exfiltration).
 * - `secure: true`: Cookie is only transmitted over HTTPS in production.
 * - `sameSite: 'lax'`: Prevents CSRF on standard navigation while allowing top-level landing.
 * - `path: '/api/auth'`: Cookie is only sent to auth endpoints, not on general document/audit calls.
 */
export function getRefreshCookieOptions() {
  const isProd = env.isProduction;
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: env.CROSS_SITE ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

/**
 * Constant-time dummy comparison to prevent username enumeration via timing attacks
 */
export async function compareDummyPassword(password) {
  try {
    await bcrypt.compare(password, DUMMY_HASH);
  } catch (err) {
    // Ignore error
  }
}
