import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Share Token & Viewer Ticket Cryptographic Service
 * 
 * WHY:
 * 1. `SHARE_TOKEN_SECRET` is completely separate from `JWT_ACCESS_SECRET`. If one key
 *    is somehow compromised or rotated, the other realm remains unimpacted.
 * 2. `jti` (JWT ID) directly matches the `SharePermission._id` in MongoDB, enabling
 *    sub-millisecond revocation lookup in Redis using the key `revoked:<jti>`.
 * 3. Minimal payload `{ jti, doc, perm }`: We never embed sensitive owner details,
 *    Cloudinary identifiers, or internal schema structures into public links.
 */

/**
 * Creates a signed share token for recipient links
 */
export function createShareToken({ sharePermissionId, documentId, permission, expiresAt }) {
  const expSeconds = Math.floor(new Date(expiresAt).getTime() / 1000);

  const payload = {
    jti: sharePermissionId.toString(),
    doc: documentId.toString(),
    perm: permission,
  };

  return jwt.sign(payload, env.SHARE_TOKEN_SECRET, {
    expiresIn: expSeconds - Math.floor(Date.now() / 1000),
  });
}

/**
 * Verifies the recipient share token signature and expiration
 */
export function verifyShareToken(token) {
  try {
    return jwt.verify(token, env.SHARE_TOKEN_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const decoded = jwt.decode(token);
      const err = ApiError.forbidden('This share link has expired.', 'SHARE_EXPIRED');
      err.jti = decoded?.jti;
      throw err;
    }
    const decoded = jwt.decode(token);
    const err = ApiError.forbidden('Invalid or tampered share link.', 'TOKEN_INVALID');
    err.jti = decoded?.jti;
    throw err;
  }
}

/**
 * Safely decodes a token without verifying signature, for forensic logging
 */
export function decodeShareTokenUnverified(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

/**
 * Issues a 10-minute Viewer Ticket for streaming the file
 * 
 * WHY: The recipient's main share token is never passed into the streaming `GET /stream`
 * URL directly where it might be logged in CDN or proxy access logs. Instead, `POST /open`
 * returns a short-lived (10m) streaming ticket.
 */
export function createViewerTicket({ sharePermissionId }) {
  return jwt.sign(
    {
      jti: sharePermissionId.toString(),
      purpose: 'stream',
    },
    env.SHARE_TOKEN_SECRET,
    {
      expiresIn: '10m',
    }
  );
}

/**
 * Verifies a streaming viewer ticket
 */
export function verifyViewerTicket(ticket) {
  try {
    const decoded = jwt.verify(ticket, env.SHARE_TOKEN_SECRET);
    if (decoded.purpose !== 'stream') {
      throw ApiError.forbidden('Invalid viewer ticket purpose', 'TICKET_INVALID');
    }
    return decoded;
  } catch (error) {
    throw ApiError.forbidden('Viewer ticket expired or invalid. Please refresh the page.', 'TICKET_EXPIRED');
  }
}
