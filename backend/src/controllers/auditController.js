import { AccessLog } from '../models/AccessLog.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Audit Trail Controller
 * 
 * WHY: Provides full regulatory and compliance transparency to document owners.
 * Read-only: No delete or update routes exist in this controller.
 */

export async function listAuditLogs(req, res) {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '25', 10);
  const { documentId, shareId, action, search, startDate, endDate } = req.query;

  const query = { owner: req.user._id };

  if (documentId) {
    query.document = documentId;
  }

  if (shareId) {
    query.sharePermission = shareId;
  }

  if (action) {
    query.action = action;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) {
      query.timestamp.$gte = new Date(startDate);
    }
    if (endDate) {
      query.timestamp.$lte = new Date(endDate);
    }
  }

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { 'actor.email': { $regex: s, $options: 'i' } },
      { ip: { $regex: s, $options: 'i' } },
      { deviceLabel: { $regex: s, $options: 'i' } },
    ];
  }

  const total = await AccessLog.countDocuments(query);
  const logs = await AccessLog.find(query)
    .populate('document', 'title originalName fileType')
    .populate('sharePermission', 'recipientEmail permission status')
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    logs: logs.map((log) => ({
      id: log._id,
      documentId: log.document?._id,
      documentTitle: log.document?.title || (log.meta?.documentDeleted ? '[Deleted Document]' : 'N/A'),
      originalName: log.document?.originalName,
      fileType: log.document?.fileType,
      shareId: log.sharePermission?._id,
      recipientEmail: log.actor?.email || log.sharePermission?.recipientEmail || 'N/A',
      actorType: log.actor?.type,
      action: log.action,
      ip: log.ip,
      deviceLabel: log.deviceLabel,
      meta: log.meta,
      timestamp: log.timestamp,
    })),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

export async function getAuditLogById(req, res) {
  const { id } = req.params;

  const log = await AccessLog.findOne({ _id: id, owner: req.user._id })
    .populate('document', 'title originalName fileType sizeBytes')
    .populate('sharePermission', 'recipientEmail permission status expiresAt maxViews viewCount')
    .lean();

  if (!log) {
    throw ApiError.notFound('Audit event not found', 'AUDIT_NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    log,
  });
}
