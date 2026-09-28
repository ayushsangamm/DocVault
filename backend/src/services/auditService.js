import { AccessLog } from '../models/AccessLog.js';

/**
 * Immutable Audit Service
 * 
 * WHY:
 * 1. Append-Only: There is no update or delete functionality in this service.
 * 2. Complete accountability: Every grant, view, denial, revocation, and device
 *    interaction is timestamped and indexed for owner discovery and compliance.
 */

/**
 * Logs an immutable audit event
 */
export async function logAuditEvent({
  document = null,
  sharePermission = null,
  owner,
  actor,
  action,
  ip = 'Unknown IP',
  userAgent = 'Unknown User-Agent',
  deviceLabel = 'Unknown Device',
  meta = {},
}) {
  try {
    const log = await AccessLog.create({
      document: document?._id || document,
      sharePermission: sharePermission?._id || sharePermission,
      owner: owner?._id || owner,
      actor: {
        type: actor?.type || 'recipient',
        email: actor?.email || '',
        userId: actor?.userId || null,
      },
      action,
      ip,
      userAgent,
      deviceLabel,
      meta,
      timestamp: new Date(),
    });

    return log;
  } catch (error) {
    // Fail-safe: Logging failure should not crash the main request pipeline,
    // but must be reported to stderr
    console.error('[Audit Log Failure] Could not persist audit entry:', error.message);
    return null;
  }
}

/**
 * Forward Detection Check:
 * Checks whether this share permission was previously accessed from a different IP/device.
 * If yes, logs `suspicious_multi_device` to alert the owner without blocking the view.
 */
export async function checkForwardDetection({ sharePermissionId, currentIp, currentUserAgent, ownerId, documentId, deviceLabel }) {
  try {
    // Look for previous views or downloads on this share
    const previousAccess = await AccessLog.findOne({
      sharePermission: sharePermissionId,
      action: { $in: ['viewed', 'downloaded'] },
    }).sort({ timestamp: 1 });

    if (previousAccess) {
      const isDifferentIp = previousAccess.ip !== currentIp;
      const isDifferentUa = previousAccess.userAgent !== currentUserAgent;

      if (isDifferentIp || isDifferentUa) {
        await logAuditEvent({
          document: documentId,
          sharePermission: sharePermissionId,
          owner: ownerId,
          actor: { type: 'recipient' },
          action: 'suspicious_multi_device',
          ip: currentIp,
          userAgent: currentUserAgent,
          deviceLabel,
          meta: {
            note: 'Link accessed from multiple distinct networks or devices (possible forward)',
            initialIp: previousAccess.ip,
            initialDevice: previousAccess.deviceLabel,
          },
        });
      }
    }
  } catch (error) {
    console.warn('[Forward Detection Warning]', error.message);
  }
}
