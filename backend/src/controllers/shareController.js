import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { SharePermission } from '../models/SharePermission.js';
import { Document } from '../models/Document.js';
import { AccessLog } from '../models/AccessLog.js';
import { ApiError } from '../utils/ApiError.js';
import { getClientInfo } from '../utils/clientInfo.js';
import { createShareToken } from '../services/shareTokenService.js';
import { blacklistToken } from '../services/blacklistService.js';
import { logAuditEvent } from '../services/auditService.js';
import { sendShareEmail } from '../services/emailService.js';

/**
 * Share Controller
 * 
 * WHY:
 * 1. Ephemeral Link Issuance: The full signed JWT URL is returned ONLY upon initial creation
 *    and never persisted to MongoDB. If an owner loses the link, they can regenerate it,
 *    which safely invalidates the old one.
 * 2. Instant Revocation: Blacklisting the `jti` in Redis with remaining TTL guarantees
 *    that any cached link fails with 403 globally within milliseconds.
 */

export const createShareSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  recipientEmail: z.string().email('Please enter a valid recipient email'),
  permission: z.enum(['view', 'download']).default('view'),
  expiresAt: z.string().optional(),
  expiresInHours: z.number().positive().max(720).optional(), // Max 30 days (720 hrs)
  maxViews: z.number().int().min(1).max(1000).nullable().optional(),
  lockToFirstDevice: z.boolean().default(false),
  note: z.string().max(300).optional().default(''),
});

export async function createShare(req, res) {
  const {
    documentId,
    recipientEmail,
    permission,
    expiresAt: rawExpiresAt,
    expiresInHours,
    maxViews = null,
    lockToFirstDevice = false,
    note = '',
  } = req.body;

  const clientInfo = getClientInfo(req);

  // Verify document exists and belongs to this owner
  const document = await Document.findOne({ _id: documentId, owner: req.user._id });
  if (!document) {
    throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  }

  // Calculate expiration date
  let computedExpiresAt;
  const now = new Date();

  if (rawExpiresAt) {
    computedExpiresAt = new Date(rawExpiresAt);
  } else if (expiresInHours) {
    computedExpiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);
  } else {
    // Default: 24 hours
    computedExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  if (isNaN(computedExpiresAt.getTime()) || computedExpiresAt <= now) {
    throw ApiError.badRequest('Expiration date must be in the future.', 'INVALID_EXPIRATION');
  }

  const maxAllowedExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  if (computedExpiresAt > maxAllowedExpiry) {
    throw ApiError.badRequest('Expiration cannot exceed 30 days into the future.', 'EXPIRATION_TOO_FAR');
  }

  // Generate an ID for the permission ahead of insertion
  const shareId = new mongoose.Types.ObjectId();
  const tokenId = shareId.toString();

  const share = await SharePermission.create({
    _id: shareId,
    document: document._id,
    sharedBy: req.user._id,
    recipientEmail: recipientEmail.toLowerCase().trim(),
    permission,
    maxViews: maxViews || null,
    viewCount: 0,
    expiresAt: computedExpiresAt,
    status: 'active',
    tokenId,
    lockToFirstDevice: Boolean(lockToFirstDevice),
    note,
  });

  // Generate signed share token
  const token = createShareToken({
    sharePermissionId: share._id,
    documentId: document._id,
    permission: share.permission,
    expiresAt: share.expiresAt,
  });

  const shareUrl = `${env.CLIENT_URL}/s/${token}`;

  // Log share creation in immutable audit ledger
  await logAuditEvent({
    document: document._id,
    sharePermission: share._id,
    owner: req.user._id,
    actor: {
      type: 'owner',
      email: req.user.email,
      userId: req.user._id,
    },
    action: 'share_created',
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    deviceLabel: clientInfo.deviceLabel,
    meta: {
      recipientEmail: share.recipientEmail,
      permission: share.permission,
      maxViews: share.maxViews,
      expiresAt: share.expiresAt,
      lockToFirstDevice: share.lockToFirstDevice,
      note: share.note,
    },
  });

  // Attempt email delivery (skipped per prompt configuration)
  const emailResult = await sendShareEmail({
    recipientEmail: share.recipientEmail,
    ownerName: req.user.name,
    documentTitle: document.title,
    permission: share.permission,
    shareUrl,
    expiresAt: share.expiresAt,
    maxViews: share.maxViews,
  });

  res.status(201).json({
    success: true,
    message: 'Access grant created successfully',
    shareUrl,
    token,
    emailSent: emailResult.emailSent,
    share: {
      id: share._id,
      documentId: document._id,
      documentTitle: document.title,
      recipientEmail: share.recipientEmail,
      permission: share.permission,
      maxViews: share.maxViews,
      viewCount: share.viewCount,
      expiresAt: share.expiresAt,
      status: share.status,
      lockToFirstDevice: share.lockToFirstDevice,
      note: share.note,
      createdAt: share.createdAt,
    },
  });
}

export async function listShares(req, res) {
  const { status, documentId, recipient } = req.query;

  const query = { sharedBy: req.user._id };
  if (status && ['active', 'revoked', 'expired', 'exhausted'].includes(status)) {
    query.status = status;
  }
  if (documentId) {
    query.document = documentId;
  }
  if (recipient) {
    query.recipientEmail = { $regex: recipient.trim(), $options: 'i' };
  }

  const shares = await SharePermission.find(query)
    .populate('document', 'title originalName fileType sizeBytes')
    .sort({ createdAt: -1 })
    .lean();

  const formatted = shares.map((s) => {
    let computedStatus = s.status;
    if (s.status !== 'revoked') {
      if (new Date() > s.expiresAt) {
        computedStatus = 'expired';
      } else if (s.maxViews !== null && s.viewCount >= s.maxViews) {
        computedStatus = 'exhausted';
      }
    }

    return {
      id: s._id,
      documentId: s.document?._id,
      documentTitle: s.document?.title || 'Unknown Document',
      originalName: s.document?.originalName,
      fileType: s.document?.fileType,
      sizeBytes: s.document?.sizeBytes,
      recipientEmail: s.recipientEmail,
      permission: s.permission,
      status: s.status,
      computedStatus,
      viewCount: s.viewCount,
      maxViews: s.maxViews,
      expiresAt: s.expiresAt,
      lockToFirstDevice: s.lockToFirstDevice,
      isDeviceBound: Boolean(s.boundSession),
      boundAt: s.boundAt,
      note: s.note,
      lastAccessedAt: s.lastAccessedAt,
      createdAt: s.createdAt,
    };
  });

  res.status(200).json({
    success: true,
    shares: formatted,
  });
}

export async function getShareById(req, res) {
  const { id } = req.params;

  const share = await SharePermission.findOne({ _id: id, sharedBy: req.user._id })
    .populate('document', 'title originalName fileType sizeBytes')
    .lean();

  if (!share) {
    throw ApiError.notFound('Share permission grant not found', 'SHARE_NOT_FOUND');
  }

  // Fetch complete audit timeline for this share
  const timeline = await AccessLog.find({ sharePermission: share._id })
    .sort({ timestamp: -1 })
    .lean();

  let computedStatus = share.status;
  if (share.status !== 'revoked') {
    if (new Date() > share.expiresAt) {
      computedStatus = 'expired';
    } else if (share.maxViews !== null && share.viewCount >= share.maxViews) {
      computedStatus = 'exhausted';
    }
  }

  res.status(200).json({
    success: true,
    share: {
      id: share._id,
      documentId: share.document?._id,
      documentTitle: share.document?.title,
      originalName: share.document?.originalName,
      fileType: share.document?.fileType,
      sizeBytes: share.document?.sizeBytes,
      recipientEmail: share.recipientEmail,
      permission: share.permission,
      status: share.status,
      computedStatus,
      viewCount: share.viewCount,
      maxViews: share.maxViews,
      expiresAt: share.expiresAt,
      lockToFirstDevice: share.lockToFirstDevice,
      isDeviceBound: Boolean(share.boundSession),
      boundAt: share.boundAt,
      note: share.note,
      revokedAt: share.revokedAt,
      revokedReason: share.revokedReason,
      lastAccessedAt: share.lastAccessedAt,
      createdAt: share.createdAt,
    },
    timeline,
  });
}

export async function revokeShare(req, res) {
  const { id } = req.params;
  const reason = req.body?.reason || 'Explicitly revoked by owner';
  const clientInfo = getClientInfo(req);

  const share = await SharePermission.findOne({ _id: id, sharedBy: req.user._id });
  if (!share) {
    throw ApiError.notFound('Share permission grant not found', 'SHARE_NOT_FOUND');
  }

  if (share.status === 'revoked') {
    return res.status(200).json({
      success: true,
      message: 'Share is already revoked',
      share,
    });
  }

  // 1. Calculate remaining seconds until expiresAt for Redis TTL
  const ttlSeconds = Math.max(60, Math.floor((new Date(share.expiresAt).getTime() - Date.now()) / 1000));

  // 2. Blacklist in Redis
  await blacklistToken(share.tokenId, ttlSeconds);

  // 3. Mark revoked in database
  share.status = 'revoked';
  share.revokedAt = new Date();
  share.revokedReason = reason;
  await share.save();

  // 4. Log event in immutable audit trail
  await logAuditEvent({
    document: share.document,
    sharePermission: share._id,
    owner: req.user._id,
    actor: {
      type: 'owner',
      email: req.user.email,
      userId: req.user._id,
    },
    action: 'share_revoked',
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    deviceLabel: clientInfo.deviceLabel,
    meta: {
      reason,
      revokedAt: share.revokedAt,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Access grant instantly revoked. Target link is now permanently disabled.',
    share: {
      id: share._id,
      status: share.status,
      revokedAt: share.revokedAt,
      revokedReason: share.revokedReason,
    },
  });
}

export async function resetDeviceLock(req, res) {
  const { id } = req.params;
  const clientInfo = getClientInfo(req);

  const share = await SharePermission.findOne({ _id: id, sharedBy: req.user._id });
  if (!share) {
    throw ApiError.notFound('Share permission grant not found', 'SHARE_NOT_FOUND');
  }

  if (!share.lockToFirstDevice) {
    throw ApiError.badRequest('This share grant does not have device locking enabled.', 'LOCK_NOT_ENABLED');
  }

  const previousBoundAt = share.boundAt;
  share.boundSession = null;
  share.boundAt = null;
  await share.save();

  // Log reset in audit trail
  await logAuditEvent({
    document: share.document,
    sharePermission: share._id,
    owner: req.user._id,
    actor: {
      type: 'owner',
      email: req.user.email,
      userId: req.user._id,
    },
    action: 'share_revoked', // or device reset note
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    deviceLabel: clientInfo.deviceLabel,
    meta: {
      actionNote: 'Device binding cleared by owner. Next device will bind on open.',
      previousBoundAt,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Device binding successfully reset. Next device to open the link will lock it.',
  });
}

export async function regenerateLink(req, res) {
  const { id } = req.params;
  const clientInfo = getClientInfo(req);

  const oldShare = await SharePermission.findOne({ _id: id, sharedBy: req.user._id });
  if (!oldShare) {
    throw ApiError.notFound('Share permission grant not found', 'SHARE_NOT_FOUND');
  }

  const doc = await Document.findById(oldShare.document);
  if (!doc) {
    throw ApiError.notFound('Associated document no longer exists', 'DOCUMENT_NOT_FOUND');
  }

  // 1. Blacklist old token
  const ttlSeconds = Math.max(60, Math.floor((new Date(oldShare.expiresAt).getTime() - Date.now()) / 1000));
  await blacklistToken(oldShare.tokenId, ttlSeconds);
  oldShare.status = 'revoked';
  oldShare.revokedAt = new Date();
  oldShare.revokedReason = 'Regenerated link replaced this grant';
  await oldShare.save();

  // 2. Create fresh share permission with same configuration
  const newShareId = new mongoose.Types.ObjectId();
  const newTokenId = newShareId.toString();

  const newShare = await SharePermission.create({
    _id: newShareId,
    document: oldShare.document,
    sharedBy: req.user._id,
    recipientEmail: oldShare.recipientEmail,
    permission: oldShare.permission,
    maxViews: oldShare.maxViews,
    viewCount: 0,
    expiresAt: oldShare.expiresAt,
    status: 'active',
    tokenId: newTokenId,
    lockToFirstDevice: oldShare.lockToFirstDevice,
    note: oldShare.note,
  });

  // 3. Create fresh token and link
  const token = createShareToken({
    sharePermissionId: newShare._id,
    documentId: doc._id,
    permission: newShare.permission,
    expiresAt: newShare.expiresAt,
  });

  const shareUrl = `${env.CLIENT_URL}/s/${token}`;

  await logAuditEvent({
    document: doc._id,
    sharePermission: newShare._id,
    owner: req.user._id,
    actor: {
      type: 'owner',
      email: req.user.email,
      userId: req.user._id,
    },
    action: 'share_created',
    ip: clientInfo.ip,
    userAgent: clientInfo.userAgent,
    deviceLabel: clientInfo.deviceLabel,
    meta: {
      note: 'Link regenerated from prior grant',
      replacedShareId: oldShare._id,
    },
  });

  res.status(201).json({
    success: true,
    message: 'New share link generated. Previous link has been invalidated.',
    shareUrl,
    token,
    share: {
      id: newShare._id,
      recipientEmail: newShare.recipientEmail,
      permission: newShare.permission,
      maxViews: newShare.maxViews,
      expiresAt: newShare.expiresAt,
      status: newShare.status,
    },
  });
}
