import { z } from 'zod';
import { Document } from '../models/Document.js';
import { SharePermission } from '../models/SharePermission.js';
import { AccessLog } from '../models/AccessLog.js';
import { ApiError } from '../utils/ApiError.js';
import { validateFileMagicBytes } from '../middleware/upload.js';
import { uploadDocumentStream, deleteDocumentAsset } from '../services/cloudinaryService.js';
import { blacklistToken } from '../services/blacklistService.js';

/**
 * Document Controller
 * 
 * WHY:
 * 1. Storage URL Isolation: Cloudinary URLs are NEVER returned or stored in MongoDB.
 * 2. Scope Isolation: Every query filters by `owner: req.user._id`.
 * 3. 404 vs 403: If an owner tries to query another user's document, we return 404 (Not Found)
 *    instead of 403 (Forbidden) to prevent ID harvesting/existence discovery.
 * 4. Cascade Invalidation on Delete: When a document is removed, all active share tokens
 *    are immediately blacklisted in Redis with their remaining TTL.
 */

export const renameDocumentSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(200, 'Title cannot exceed 200 characters'),
});

export async function uploadDocument(req, res) {
  if (!req.file) {
    throw ApiError.badRequest('No file provided for upload', 'FILE_MISSING');
  }

  const title = (req.body.title || req.file.originalname).trim();
  if (title.length > 200) {
    throw ApiError.badRequest('Title cannot exceed 200 characters', 'INVALID_TITLE');
  }

  // Magic bytes inspection
  const isValidSignature = validateFileMagicBytes(req.file.buffer, req.file.mimetype);
  if (!isValidSignature) {
    throw ApiError.badRequest(
      'File signature mismatch: File content does not match its declared MIME type.',
      'INVALID_FILE_SIGNATURE'
    );
  }

  // Determine fileType category
  let fileType = 'other';
  if (req.file.mimetype === 'application/pdf') {
    fileType = 'pdf';
  } else if (req.file.mimetype.startsWith('image/')) {
    fileType = 'image';
  }

  // Upload to Cloudinary with authenticated type
  const uploadResult = await uploadDocumentStream(req.file.buffer, {
    userId: req.user._id.toString(),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
  });

  const doc = await Document.create({
    title,
    originalName: req.file.originalname,
    owner: req.user._id,
    cloudinaryPublicId: uploadResult.publicId,
    resourceType: uploadResult.resourceType,
    mimeType: req.file.mimetype,
    fileType,
    sizeBytes: req.file.size,
  });

  res.status(201).json({
    success: true,
    message: 'Document vaulted securely',
    document: {
      id: doc._id,
      title: doc.title,
      originalName: doc.originalName,
      fileType: doc.fileType,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
    },
  });
}

export async function listDocuments(req, res) {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const search = req.query.search?.trim();

  const query = { owner: req.user._id };
  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const total = await Document.countDocuments(query);
  const documents = await Document.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // Attach active share counts to each document
  const docIds = documents.map((d) => d._id);
  const now = new Date();

  const activeSharesAgg = await SharePermission.aggregate([
    {
      $match: {
        document: { $in: docIds },
        status: 'active',
        expiresAt: { $gt: now },
      },
    },
    {
      $group: {
        _id: '$document',
        count: { $sum: 1 },
      },
    },
  ]);

  const activeShareCountMap = {};
  activeSharesAgg.forEach((item) => {
    activeShareCountMap[item._id.toString()] = item.count;
  });

  const formattedDocs = documents.map((d) => ({
    id: d._id,
    title: d.title,
    originalName: d.originalName,
    fileType: d.fileType,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    activeSharesCount: activeShareCountMap[d._id.toString()] || 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  res.status(200).json({
    success: true,
    documents: formattedDocs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

export async function getDocumentById(req, res) {
  const { id } = req.params;

  const doc = await Document.findOne({ _id: id, owner: req.user._id });
  if (!doc) {
    throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  }

  // Fetch all shares for this document
  const shares = await SharePermission.find({ document: doc._id })
    .sort({ createdAt: -1 })
    .lean();

  // Fetch recent access logs for this document
  const recentLogs = await AccessLog.find({ document: doc._id })
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();

  res.status(200).json({
    success: true,
    document: {
      id: doc._id,
      title: doc.title,
      originalName: doc.originalName,
      fileType: doc.fileType,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    shares: shares.map((s) => ({
      id: s._id,
      recipientEmail: s.recipientEmail,
      permission: s.permission,
      status: s.status,
      computedStatus:
        s.status === 'revoked'
          ? 'revoked'
          : new Date() > s.expiresAt
          ? 'expired'
          : s.maxViews !== null && s.viewCount >= s.maxViews
          ? 'exhausted'
          : 'active',
      viewCount: s.viewCount,
      maxViews: s.maxViews,
      expiresAt: s.expiresAt,
      lockToFirstDevice: s.lockToFirstDevice,
      isDeviceBound: !!s.boundSession,
      note: s.note,
      createdAt: s.createdAt,
    })),
    recentLogs,
  });
}

export async function renameDocument(req, res) {
  const { id } = req.params;
  const { title } = req.body;

  const doc = await Document.findOneAndUpdate(
    { _id: id, owner: req.user._id },
    { $set: { title } },
    { new: true }
  );

  if (!doc) {
    throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    message: 'Document title updated',
    document: {
      id: doc._id,
      title: doc.title,
    },
  });
}

export async function deleteDocument(req, res) {
  const { id } = req.params;

  // We explicitly select cloudinaryPublicId to remove it from Cloudinary
  const doc = await Document.findOne({ _id: id, owner: req.user._id }).select('+cloudinaryPublicId');
  if (!doc) {
    throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
  }

  // 1. Destroy asset in Cloudinary
  await deleteDocumentAsset(doc.cloudinaryPublicId, doc.resourceType);

  // 2. Find and blacklist all active shares for this document
  const activeShares = await SharePermission.find({
    document: doc._id,
    status: 'active',
  });

  const now = Date.now();
  for (const share of activeShares) {
    const ttlSeconds = Math.max(60, Math.floor((new Date(share.expiresAt).getTime() - now) / 1000));
    await blacklistToken(share.tokenId, ttlSeconds);
    share.status = 'revoked';
    share.revokedAt = new Date();
    share.revokedReason = 'Document was deleted by owner';
    await share.save();
  }

  // 3. Mark access logs metadata with document deletion note (immutable logs preserved)
  await AccessLog.updateMany(
    { document: doc._id },
    { $set: { 'meta.documentDeleted': true } }
  );

  // 4. Delete the document record itself
  await Document.deleteOne({ _id: doc._id });

  res.status(200).json({
    success: true,
    message: 'Document and its active shares permanently purged',
  });
}
