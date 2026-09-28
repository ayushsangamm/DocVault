import mongoose from 'mongoose';

/**
 * Access Log Model (Immutable Audit Ledger)
 * 
 * WHY:
 * 1. Append-Only: There are intentionally NO update or delete routes for access logs.
 *    Every security event, granted view, denied attempt, or device mismatch is preserved
 *    for regulatory compliance and owner forensic review.
 * 2. Compound Indexes: Enables sub-10ms queries for owner dashboards, per-document
 *    timelines, and individual share inspection drawers.
 */
const accessLogSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      index: true,
      default: null,
    },
    sharePermission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SharePermission',
      index: true,
      default: null,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actor: {
      type: {
        type: String,
        enum: ['recipient', 'owner'],
        required: true,
      },
      email: {
        type: String,
        default: '',
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },
    action: {
      type: String,
      enum: [
        'share_created',
        'share_revoked',
        'viewed',
        'downloaded',
        'download_blocked',
        'access_denied_expired',
        'access_denied_revoked',
        'access_denied_max_views',
        'access_denied_different_device',
        'access_denied_invalid_token',
        'access_denied_unauthorized_account',
        'suspicious_multi_device',
      ],
      required: true,
      index: true,
    },
    ip: {
      type: String,
      default: 'Unknown IP',
    },
    userAgent: {
      type: String,
      default: 'Unknown User-Agent',
    },
    deviceLabel: {
      type: String,
      default: 'Unknown Device',
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We use immutable `timestamp`
    versionKey: false,
  }
);

// Compound indexes for owner analytics and per-document audit trails
accessLogSchema.index({ owner: 1, timestamp: -1 });
accessLogSchema.index({ document: 1, timestamp: -1 });
accessLogSchema.index({ sharePermission: 1, timestamp: -1 });

export const AccessLog = mongoose.model('AccessLog', accessLogSchema);
