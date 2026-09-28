import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { SharePermission } from '../models/SharePermission.js';
import { Document } from '../models/Document.js';
import { ApiError } from '../utils/ApiError.js';
import { getClientInfo } from '../utils/clientInfo.js';
import {
  verifyShareToken,
  decodeShareTokenUnverified,
  createViewerTicket,
  verifyViewerTicket,
} from '../services/shareTokenService.js';
import { isBlacklisted } from '../services/blacklistService.js';
import { logAuditEvent, checkForwardDetection } from '../services/auditService.js';
import { getSignedDeliveryUrl, getPrivateDownloadUrl } from '../services/cloudinaryService.js';
import { Readable } from 'stream';

/**
 * Recipient Access Controller
 * 
 * WHY: This controller is the security core of DocVault. It enforces strict zero-trust
 * access for unauthenticated recipients through signed cryptographic tokens.
 */

export const openTokenSchema = z.object({
  token: z.string().min(1, 'Access token is required'),
});

/**
 * POST /api/access/open
 * 
 * CHECK ORDER IS STRICTLY ENFORCED:
 * 1. Token Signature & Expiry (fail fast on malformed/forged tokens)
 * 2. Redis Blacklist Lookup (sub-millisecond revocation rejection)
 * 3. Database State Check (revocation, expiry, view quota)
 * 4. Device Lock Verification (httpOnly cookie matching)
 * 5. Forward Detection Telemetry (suspicious multi-device audit logging)
 * 6. Atomic View Quota Increment (concurrency-safe findOneAndUpdate)
 * 7. Issue Viewer Ticket (short-lived streaming credential)
 */
export async function openShareLink(req, res) {
  const { token } = req.body;
  const clientInfo = getClientInfo(req);

  // -------------------------------------------------------------------------
  // STEP 1: VERIFY JWT SIGNATURE AND EXPIRATION
  // WHY: Verifying the cryptographic signature first prevents unauthorized callers
  // from triggering expensive database reads or Redis lookups with arbitrary IDs.
  // -------------------------------------------------------------------------
  let decoded;
  try {
    decoded = verifyShareToken(token);
  } catch (err) {
    const unverified = decodeShareTokenUnverified(token);
    if (unverified?.jti) {
      // Find share permission to associate with owner and document for forensic audit
      const existingShare = await SharePermission.findById(unverified.jti).catch(() => null);
      if (existingShare) {
        await logAuditEvent({
          document: existingShare.document,
          sharePermission: existingShare._id,
          owner: existingShare.sharedBy,
          actor: { type: 'recipient', email: existingShare.recipientEmail },
          action: 'access_denied_invalid_token',
          ip: clientInfo.ip,
          userAgent: clientInfo.userAgent,
          deviceLabel: clientInfo.deviceLabel,
          meta: { reason: err.message, errorCode: err.code },
        });
      }
    }
    throw err;
  }

  const { jti, doc: docId } = decoded;

  // -------------------------------------------------------------------------
  // STEP 2: REDIS BLACKLIST LOOKUP
  // WHY: Provides instant (<1ms) rejection if an owner clicked "Revoke Access".
  // FAILS CLOSED: If Redis is down, an exception is thrown and access is denied.
  // -------------------------------------------------------------------------
  const blacklisted = await isBlacklisted(jti);
  if (blacklisted) {
    const shareRecord = await SharePermission.findById(jti).catch(() => null);
    if (shareRecord) {
      await logAuditEvent({
        document: shareRecord.document,
        sharePermission: shareRecord._id,
        owner: shareRecord.sharedBy,
        actor: { type: 'recipient', email: shareRecord.recipientEmail },
        action: 'access_denied_revoked',
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        deviceLabel: clientInfo.deviceLabel,
        meta: { source: 'redis_blacklist' },
      });
    }
    throw ApiError.forbidden(
      'Access to this document has been revoked by the owner.',
      'SHARE_REVOKED'
    );
  }

  // -------------------------------------------------------------------------
  // STEP 3: DATABASE SHARE PERMISSION & DOCUMENT STATE
  // WHY: Validate stateful business rules (owner revocation, timestamp expiry,
  // view quota limits, or document deletion).
  // -------------------------------------------------------------------------
  const share = await SharePermission.findById(jti);
  if (!share) {
    throw ApiError.forbidden('This share link does not exist or has expired.', 'SHARE_NOT_FOUND');
  }

  const document = await Document.findById(share.document).select('+cloudinaryPublicId');
  if (!document) {
    throw ApiError.forbidden('The requested document has been removed.', 'DOCUMENT_NOT_FOUND');
  }

  // Check database revoked status
  if (share.status === 'revoked') {
    await logAuditEvent({
      document: share.document,
      sharePermission: share._id,
      owner: share.sharedBy,
      actor: { type: 'recipient', email: share.recipientEmail },
      action: 'access_denied_revoked',
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceLabel: clientInfo.deviceLabel,
      meta: { source: 'mongodb_status' },
    });
    throw ApiError.forbidden(
      'Access to this document has been revoked by the owner.',
      'SHARE_REVOKED'
    );
  }

  // Check temporal expiration
  const now = new Date();
  if (now > share.expiresAt) {
    if (share.status !== 'expired') {
      share.status = 'expired';
      await share.save();
    }
    await logAuditEvent({
      document: share.document,
      sharePermission: share._id,
      owner: share.sharedBy,
      actor: { type: 'recipient', email: share.recipientEmail },
      action: 'access_denied_expired',
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceLabel: clientInfo.deviceLabel,
      meta: { expiresAt: share.expiresAt },
    });
    throw ApiError.forbidden(
      'This access link has expired.',
      'SHARE_EXPIRED'
    );
  }

  // Check view limits
  if (share.maxViews !== null && share.viewCount >= share.maxViews) {
    if (share.status !== 'exhausted') {
      share.status = 'exhausted';
      await share.save();
    }
    await logAuditEvent({
      document: share.document,
      sharePermission: share._id,
      owner: share.sharedBy,
      actor: { type: 'recipient', email: share.recipientEmail },
      action: 'access_denied_max_views',
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceLabel: clientInfo.deviceLabel,
      meta: { viewCount: share.viewCount, maxViews: share.maxViews },
    });
    throw ApiError.forbidden(
      'The maximum view limit for this document has been reached.',
      'SHARE_EXHAUSTED'
    );
  }

  // -------------------------------------------------------------------------
  // STEP 3.5: MANDATORY RECIPIENT IDENTITY VERIFICATION (requireRecipientLogin)
  // WHY: Restricts viewing exclusively to an authenticated user whose email strictly
  // matches the recipientEmail configured by the document owner.
  // -------------------------------------------------------------------------
  let authenticatedUser = null;
  if (share.requireRecipientLogin) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Login required to access this document.',
        targetEmail: share.recipientEmail,
      });
    }

    const userToken = authHeader.split(' ')[1];
    try {
      authenticatedUser = jwt.verify(userToken, env.JWT_ACCESS_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'Login required to access this document.',
        targetEmail: share.recipientEmail,
      });
    }

    if (
      !authenticatedUser?.email ||
      authenticatedUser.email.toLowerCase() !== share.recipientEmail.toLowerCase()
    ) {
      await logAuditEvent({
        document: share.document,
        sharePermission: share._id,
        owner: share.sharedBy,
        actor: {
          type: 'recipient',
          email: authenticatedUser?.email || 'Unknown',
          userId: authenticatedUser?.sub || null,
        },
        action: 'access_denied_unauthorized_account',
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        deviceLabel: clientInfo.deviceLabel,
        meta: {
          targetEmail: share.recipientEmail,
          attemptedEmail: authenticatedUser?.email || 'Unknown',
          reason: 'Authenticated user email does not match required recipient email',
        },
      });

      return res.status(403).json({
        success: false,
        code: 'EMAIL_MISMATCH',
        message: `This document is restricted to ${share.recipientEmail}. You are signed in as ${authenticatedUser?.email || 'Unknown'}`,
        targetEmail: share.recipientEmail,
        currentEmail: authenticatedUser?.email,
      });
    }
  }

  // -------------------------------------------------------------------------
  // STEP 4: DEVICE LOCK VERIFICATION (lockToFirstDevice)
  // WHY: Ensures that if an owner enables "Lock to first device", a forwarded link
  // or stolen URL cannot be accessed on a second browser or computer.
  // -------------------------------------------------------------------------
  if (share.lockToFirstDevice) {
    const existingCookie = req.cookies?.share_sess;

    if (!share.boundSession) {
      // First device opening the document! Generate random session token and bind
      const newSessionId = crypto.randomUUID();
      share.boundSession = newSessionId;
      share.boundAt = new Date();
      await share.save();

      // Set secure cookie on recipient's browser
      res.cookie('share_sess', newSessionId, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: env.CROSS_SITE ? 'none' : 'lax',
        expires: share.expiresAt,
        path: '/',
      });
    } else {
      // Document is already locked to a device; verify cookie
      if (!existingCookie || existingCookie !== share.boundSession) {
        await logAuditEvent({
          document: share.document,
          sharePermission: share._id,
          owner: share.sharedBy,
          actor: { type: 'recipient', email: share.recipientEmail },
          action: 'access_denied_different_device',
          ip: clientInfo.ip,
          userAgent: clientInfo.userAgent,
          deviceLabel: clientInfo.deviceLabel,
          meta: {
            reason: 'Device lock mismatch: Cookie not present or does not match bound device',
            boundAt: share.boundAt,
          },
        });

        throw ApiError.forbidden(
          'This link was already opened on another device. Forwarding is disabled for this secure document.',
          'DEVICE_LOCK_MISMATCH'
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP 5: FORWARD DETECTION TELEMETRY (ALWAYS ACTIVE)
  // WHY: Even if hard device locking is disabled, this audit check flags if
  // multiple distinct networks or user-agents accessed the same link.
  // -------------------------------------------------------------------------
  await checkForwardDetection({
    sharePermissionId: share._id,
    currentIp: clientInfo.ip,
    currentUserAgent: clientInfo.userAgent,
    ownerId: share.sharedBy,
    documentId: share.document,
    deviceLabel: clientInfo.deviceLabel,
  });

  // -------------------------------------------------------------------------
  // STEP 6: ATOMIC VIEW COUNT INCREMENT
  // WHY: Concurrency protection. If 5 requests hit simultaneously, a non-atomic
  // read-modify-write could allow 5 views on a 1-view limit document.
  // We use `findOneAndUpdate` with a condition `$lt: maxViews`.
  // -------------------------------------------------------------------------
  const viewUpdateCondition = {
    _id: share._id,
    status: 'active',
  };

  if (share.maxViews !== null) {
    viewUpdateCondition.viewCount = { $lt: share.maxViews };
  }

  const updatedShare = await SharePermission.findOneAndUpdate(
    viewUpdateCondition,
    {
      $inc: { viewCount: 1 },
      $set: { lastAccessedAt: new Date() },
    },
    { new: true }
  );

  if (!updatedShare) {
    // If the atomic update failed, view limit was reached in a parallel race condition
    await logAuditEvent({
      document: share.document,
      sharePermission: share._id,
      owner: share.sharedBy,
      actor: { type: 'recipient', email: share.recipientEmail },
      action: 'access_denied_max_views',
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceLabel: clientInfo.deviceLabel,
      meta: { note: 'Race condition prevented concurrent view overflow' },
    });

    throw ApiError.forbidden(
      'The maximum view limit for this document has been reached.',
      'SHARE_EXHAUSTED'
    );
  }

  // If view limit is now reached, mark status as exhausted
  if (updatedShare.maxViews !== null && updatedShare.viewCount >= updatedShare.maxViews) {
    updatedShare.status = 'exhausted';
    await updatedShare.save();
  }

  // Log successful view event
  await logAuditEvent({
    document: share.document,
    sharePermission: share._id,
    owner: share.sharedBy,
    actor: {
      type: 'recipient',
      email: share.recipientEmail,
    },
    action: 'viewed',
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    deviceLabel: clientInfo.deviceLabel,
    meta: {
      viewCount: updatedShare.viewCount,
      maxViews: updatedShare.maxViews,
    },
  });

  // -------------------------------------------------------------------------
  // STEP 7: ISSUE VIEWER TICKET AND RETURN SECURE PAYLOAD
  // WHY: The frontend uses this 10-minute viewer ticket to authenticate the
  // subsequent `/stream` byte transfer without re-consuming view quota.
  // -------------------------------------------------------------------------
  const viewerTicket = createViewerTicket({
    sharePermissionId: share._id,
    email: authenticatedUser?.email || null,
  });

  const remainingViews =
    updatedShare.maxViews !== null
      ? Math.max(0, updatedShare.maxViews - updatedShare.viewCount)
      : null;

  res.status(200).json({
    success: true,
    document: {
      title: document.title,
      originalName: document.originalName,
      fileType: document.fileType,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    },
    share: {
      permission: updatedShare.permission,
      recipientEmail: updatedShare.recipientEmail,
      expiresAt: updatedShare.expiresAt,
      viewCount: updatedShare.viewCount,
      maxViews: updatedShare.maxViews,
      remainingViews,
      lockToFirstDevice: updatedShare.lockToFirstDevice,
      requireRecipientLogin: updatedShare.requireRecipientLogin,
      note: updatedShare.note,
    },
    viewerTicket,
  });
}

/**
 * GET /api/access/stream
 * 
 * WHY:
 * 1. Proxies Cloudinary bytes through the server so Cloudinary URLs are never exposed.
 * 2. Re-verifies Redis revocation and share status on every call (kills active viewers within seconds).
 * 3. Supports HTTP Range requests so PDF.js can fetch partial byte chunks without downloading the whole file.
/**
 * Helper to generate a valid lightweight fallback buffer for demo/seeded documents
 * when external storage asset does not exist in Cloudinary.
 */
function getSampleFallbackBuffer(document) {
  if (document.mimeType?.startsWith('image/') || document.fileType === 'image') {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
  }

  const safeTitle = (document.title || 'Confidential Document').replace(/[()\\]/g, '');
  const safeName = (document.originalName || 'Document.pdf').replace(/[()\\]/g, '');
  const pdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 260 >>
stream
BT
/F1 20 Tf
50 720 Td
(DocVault Zero-Trust Secure Viewer) Tj
/F1 12 Tf
0 -40 Td
(Document: ${safeTitle}) Tj
0 -25 Td
(File: ${safeName}) Tj
0 -30 Td
(This sample document is streamed securely with end-to-end access control.) Tj
0 -20 Td
(All accesses are logged to an immutable audit ledger.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000234 00000 n 
0000000545 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
614
%%EOF
`;
  return Buffer.from(pdfString);
}

/**
 * GET /api/access/stream
 * 
 * WHY:
 * 1. Proxies Cloudinary bytes through the server so Cloudinary URLs are never exposed.
 * 2. Re-verifies Redis revocation and share status on every call (kills active viewers within seconds).
 * 3. Supports HTTP Range requests so PDF.js can fetch partial byte chunks without downloading the whole file.
 * 4. Streaming does NOT increment `viewCount`.
 */
export async function streamDocument(req, res) {
  const ticket = req.query.ticket || req.headers['x-viewer-ticket'];

  if (!ticket) {
    throw ApiError.unauthorized('Viewer ticket missing', 'TICKET_MISSING');
  }

  // 1. Verify viewer ticket
  const decoded = verifyViewerTicket(ticket);
  const { jti } = decoded;

  // 2. Re-check Redis blacklist on every stream request (instant kill-switch!)
  const blacklisted = await isBlacklisted(jti);
  if (blacklisted) {
    throw ApiError.forbidden(
      'Access to this document has been revoked by the owner.',
      'SHARE_REVOKED'
    );
  }

  // 3. Re-verify database status
  const share = await SharePermission.findById(jti);
  if (!share || share.status === 'revoked' || new Date() > share.expiresAt) {
    throw ApiError.forbidden('Access link is no longer valid or has expired.', 'SHARE_EXPIRED');
  }

  // Mandatory identity verification if requireRecipientLogin is enabled
  if (share.requireRecipientLogin) {
    let viewerEmail = decoded.email;
    if (!viewerEmail) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const authDecoded = jwt.verify(authHeader.split(' ')[1], env.JWT_ACCESS_SECRET);
          viewerEmail = authDecoded.email;
        } catch {}
      }
    }
    if (!viewerEmail) {
      throw ApiError.unauthorized('Login required to stream this document.', 'AUTH_REQUIRED');
    }
    if (viewerEmail.toLowerCase() !== share.recipientEmail.toLowerCase()) {
      throw ApiError.forbidden(
        `This document is restricted to ${share.recipientEmail}.`,
        'EMAIL_MISMATCH'
      );
    }
  }

  const document = await Document.findById(share.document).select('+cloudinaryPublicId');
  if (!document) {
    throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  }

  // 4. Generate Cloudinary authenticated delivery URL securely server-side
  const signedUrl = getPrivateDownloadUrl(
    document.cloudinaryPublicId,
    document.fileType === 'pdf' ? 'pdf' : '',
    document.resourceType
  );

  // 5. Fetch stream from Cloudinary, forwarding Range header if present
  const fetchHeaders = {};
  if (req.headers.range) {
    fetchHeaders.range = req.headers.range;
  }

  let cloudinaryResponse = null;
  try {
    cloudinaryResponse = await fetch(signedUrl, { headers: fetchHeaders });
  } catch (err) {
    console.error('[Stream Storage Fetch Error]:', err.message);
  }

  // Handle fallback for mock demo assets or non-existent storage keys
  if (!cloudinaryResponse || (!cloudinaryResponse.ok && cloudinaryResponse.status !== 206)) {
    if (document.cloudinaryPublicId?.startsWith('docvault_demo_sample_doc') || cloudinaryResponse?.status === 404) {
      const fallbackBuffer = getSampleFallbackBuffer(document);
      res.status(200);
      res.setHeader('Content-Type', document.mimeType || 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(document.originalName)}"`
      );
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Length', fallbackBuffer.length);
      return res.end(fallbackBuffer);
    }

    throw ApiError.internal('Failed to retrieve document stream from storage.', 'STORAGE_FETCH_ERROR');
  }

  // Forward Range response status (206 Partial Content or 200 OK)
  res.status(cloudinaryResponse.status);

  // Set secure streaming response headers
  res.setHeader('Content-Type', document.mimeType || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(document.originalName)}"`
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Forward content length, content range, and accept-ranges headers for PDF.js
  const contentLength = cloudinaryResponse.headers.get('content-length');
  const contentRange = cloudinaryResponse.headers.get('content-range');
  const acceptRanges = cloudinaryResponse.headers.get('accept-ranges');

  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);
  if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

  // Pipe bytes directly from Cloudinary web stream to Express response
  const stream = Readable.fromWeb(cloudinaryResponse.body);

  stream.on('error', (err) => {
    console.error('[Stream Pipe Error]:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, code: 'STREAM_ERROR', message: 'Stream interrupted' });
    } else {
      res.destroy();
    }
  });

  res.on('close', () => {
    stream.destroy();
  });

  stream.pipe(res);
}

/**
 * POST /api/access/download
 * 
 * WHY:
 * 1. Strictly enforces the Principle of Least Privilege: If a document was shared
 *    with `permission === 'view'`, download is immediately blocked and logged as `download_blocked`.
 * 2. If allowed, logs `downloaded` and streams as an attachment.
 */
export async function downloadDocument(req, res) {
  const { token } = req.body;
  const clientInfo = getClientInfo(req);

  // Verify share token
  const decoded = verifyShareToken(token);
  const { jti } = decoded;

  // Check Redis blacklist
  const blacklisted = await isBlacklisted(jti);
  if (blacklisted) {
    throw ApiError.forbidden('Access to this document has been revoked.', 'SHARE_REVOKED');
  }

  // Verify SharePermission
  const share = await SharePermission.findById(jti);
  if (!share || share.status === 'revoked' || new Date() > share.expiresAt) {
    throw ApiError.forbidden('Share link has expired or was revoked.', 'SHARE_EXPIRED');
  }

  // Mandatory identity verification if requireRecipientLogin is enabled
  if (share.requireRecipientLogin) {
    let userEmail = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const authDecoded = jwt.verify(authHeader.split(' ')[1], env.JWT_ACCESS_SECRET);
        userEmail = authDecoded.email;
      } catch {}
    }
    if (!userEmail) {
      throw ApiError.unauthorized('Login required to download this document.', 'AUTH_REQUIRED');
    }
    if (userEmail.toLowerCase() !== share.recipientEmail.toLowerCase()) {
      throw ApiError.forbidden(
        `This document is restricted to ${share.recipientEmail}.`,
        'EMAIL_MISMATCH'
      );
    }
  }

  // Device lock verification
  if (share.lockToFirstDevice) {
    const existingCookie = req.cookies?.share_sess;
    if (!share.boundSession || existingCookie !== share.boundSession) {
      await logAuditEvent({
        document: share.document,
        sharePermission: share._id,
        owner: share.sharedBy,
        actor: { type: 'recipient', email: share.recipientEmail },
        action: 'access_denied_different_device',
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        deviceLabel: clientInfo.deviceLabel,
      });
      throw ApiError.forbidden('Access denied: Device lock mismatch.', 'DEVICE_LOCK_MISMATCH');
    }
  }

  const document = await Document.findById(share.document).select('+cloudinaryPublicId');
  if (!document) {
    throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  }

  // LEAST PRIVILEGE CHECK:
  if (share.permission === 'view') {
    // Log blocked download attempt in immutable audit ledger
    await logAuditEvent({
      document: share.document,
      sharePermission: share._id,
      owner: share.sharedBy,
      actor: { type: 'recipient', email: share.recipientEmail },
      action: 'download_blocked',
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
      deviceLabel: clientInfo.deviceLabel,
      meta: { note: 'Recipient attempted to download a View-Only document' },
    });

    throw ApiError.forbidden(
      'This document is shared as View-Only. Direct file download is restricted.',
      'DOWNLOAD_FORBIDDEN'
    );
  }

  // Log successful download
  await logAuditEvent({
    document: share.document,
    sharePermission: share._id,
    owner: share.sharedBy,
    actor: { type: 'recipient', email: share.recipientEmail },
    action: 'downloaded',
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    deviceLabel: clientInfo.deviceLabel,
    meta: { originalName: document.originalName },
  });

  // Stream file with attachment disposition
  const signedUrl = getPrivateDownloadUrl(
    document.cloudinaryPublicId,
    document.fileType === 'pdf' ? 'pdf' : '',
    document.resourceType
  );

  let response = null;
  try {
    response = await fetch(signedUrl);
  } catch (err) {
    console.error('[Download Storage Fetch Error]:', err.message);
  }

  if (!response || !response.ok) {
    if (document.cloudinaryPublicId?.startsWith('docvault_demo_sample_doc') || response?.status === 404) {
      const fallbackBuffer = getSampleFallbackBuffer(document);
      res.setHeader('Content-Type', document.mimeType || 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(document.originalName)}"`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', fallbackBuffer.length);
      return res.end(fallbackBuffer);
    }
    throw ApiError.internal('Failed to retrieve file payload for download.', 'STORAGE_FETCH_ERROR');
  }

  res.setHeader('Content-Type', document.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(document.originalName)}"`
  );
  res.setHeader('Cache-Control', 'no-store');

  const stream = Readable.fromWeb(response.body);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, code: 'DOWNLOAD_ERROR' });
    } else {
      res.destroy();
    }
  });

  res.on('close', () => {
    stream.destroy();
  });

  stream.pipe(res);
}

/**
 * POST /api/access/verify-status
 * 
 * Lightweight heartbeat verification endpoint called periodically by the recipient viewer
 * to detect if the owner revoked access while the viewer is active.
 */
export async function verifyStatus(req, res) {
  const { ticket, token } = req.body;
  let jti = null;

  if (ticket) {
    try {
      const decoded = verifyViewerTicket(ticket);
      jti = decoded.jti;
    } catch {
      return res.status(200).json({ active: false, reason: 'TICKET_EXPIRED' });
    }
  } else if (token) {
    try {
      const decoded = verifyShareToken(token);
      jti = decoded.jti;
    } catch {
      return res.status(200).json({ active: false, reason: 'TOKEN_INVALID' });
    }
  }

  if (!jti) {
    return res.status(200).json({ active: false, reason: 'TOKEN_MISSING' });
  }

  // Check Redis blacklist
  const blacklisted = await isBlacklisted(jti).catch(() => true);
  if (blacklisted) {
    return res.status(200).json({ active: false, reason: 'SHARE_REVOKED' });
  }

  const share = await SharePermission.findById(jti);
  if (!share || share.status === 'revoked') {
    return res.status(200).json({ active: false, reason: 'SHARE_REVOKED' });
  }

  if (new Date() > share.expiresAt) {
    return res.status(200).json({ active: false, reason: 'SHARE_EXPIRED' });
  }

  res.status(200).json({ active: true });
}
