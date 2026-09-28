import { Document } from '../models/Document.js';
import { SharePermission } from '../models/SharePermission.js';
import { AccessLog } from '../models/AccessLog.js';

/**
 * Analytics Controller
 * 
 * WHY: Calculates real operational security metrics computed directly from MongoDB.
 * No mock or hardcoded numbers: Owners see accurate real-time telemetry on their document vault.
 */

export async function getAnalyticsSummary(req, res) {
  const ownerId = req.user._id;
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 1. Total Documents
  const totalDocuments = await Document.countDocuments({ owner: ownerId });

  // 2. Shares Metrics
  const totalShares = await SharePermission.countDocuments({ sharedBy: ownerId });
  const activeShares = await SharePermission.countDocuments({
    sharedBy: ownerId,
    status: 'active',
    expiresAt: { $gt: now },
  });
  const revokedShares = await SharePermission.countDocuments({
    sharedBy: ownerId,
    status: 'revoked',
  });
  const sharesExpiringWithin24h = await SharePermission.countDocuments({
    sharedBy: ownerId,
    status: 'active',
    expiresAt: { $gt: now, $lte: in24h },
  });

  const revocationRate =
    totalShares > 0 ? ((revokedShares / totalShares) * 100).toFixed(1) : '0.0';

  // 3. Action Counts from AccessLog
  const totalViews = await AccessLog.countDocuments({
    owner: ownerId,
    action: 'viewed',
  });

  const totalDownloads = await AccessLog.countDocuments({
    owner: ownerId,
    action: 'downloaded',
  });

  const blockedActions = [
    'download_blocked',
    'access_denied_expired',
    'access_denied_revoked',
    'access_denied_max_views',
    'access_denied_different_device',
    'access_denied_invalid_token',
  ];

  const blockedAttempts = await AccessLog.countDocuments({
    owner: ownerId,
    action: { $in: blockedActions },
  });

  // 4. Denied Reasons Breakdown
  const deniedBreakdownAgg = await AccessLog.aggregate([
    {
      $match: {
        owner: ownerId,
        action: { $in: blockedActions },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
      },
    },
  ]);

  const deniedReasons = {
    download_blocked: 0,
    access_denied_expired: 0,
    access_denied_revoked: 0,
    access_denied_max_views: 0,
    access_denied_different_device: 0,
    access_denied_invalid_token: 0,
  };

  deniedBreakdownAgg.forEach((item) => {
    if (deniedReasons[item._id] !== undefined) {
      deniedReasons[item._id] = item.count;
    }
  });

  // 5. Views Per Day (Last 14 Days)
  const viewsPerDayAgg = await AccessLog.aggregate([
    {
      $match: {
        owner: ownerId,
        action: 'viewed',
        timestamp: { $gte: fourteenDaysAgo },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
        },
        views: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill in zero days for complete 14-day chart
  const viewsMap = {};
  viewsPerDayAgg.forEach((v) => {
    viewsMap[v._id] = v.views;
  });

  const viewsPerDay = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    viewsPerDay.push({
      date: dateStr,
      views: viewsMap[dateStr] || 0,
    });
  }

  // 6. Top Viewed Documents
  const topDocsAgg = await AccessLog.aggregate([
    {
      $match: {
        owner: ownerId,
        action: 'viewed',
        document: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$document',
        viewCount: { $sum: 1 },
      },
    },
    { $sort: { viewCount: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'documents',
        localField: '_id',
        foreignField: '_id',
        as: 'doc',
      },
    },
    { $unwind: { path: '$doc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        documentId: '$_id',
        title: { $ifNull: ['$doc.title', '[Deleted Document]'] },
        fileType: '$doc.fileType',
        sizeBytes: '$doc.sizeBytes',
        viewCount: 1,
      },
    },
  ]);

  res.status(200).json({
    success: true,
    summary: {
      totalDocuments,
      totalShares,
      activeShares,
      revokedShares,
      revocationRate: `${revocationRate}%`,
      sharesExpiringWithin24h,
      totalViews,
      totalDownloads,
      blockedAttempts,
      viewsPerDay,
      deniedReasons,
      topDocuments: topDocsAgg,
    },
  });
}
