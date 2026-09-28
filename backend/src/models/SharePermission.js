import mongoose from 'mongoose';

/**
 * Share Permission Model
 * 
 * WHY:
 * 1. Represents the current state of a cryptographic grant.
 * 2. `tokenId` is identical to `_id.toString()`, which acts as the JWT `jti` (JWT ID).
 *    This allows 1:1 binding between the signed URL token, the Redis blacklist,
 *    and the MongoDB record.
 * 3. Lazy status evaluation: if current time > expiresAt, effective status is computed
 *    as 'expired' even without an active cron job.
 */
const sharePermissionSchema = new mongoose.Schema(
  {
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientEmail: {
      type: String,
      required: [true, 'Recipient email is required'],
      lowercase: true,
      trim: true,
    },
    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    permission: {
      type: String,
      enum: ['view', 'download'],
      default: 'view',
      required: true,
    },
    maxViews: {
      type: Number,
      default: null, // null = unlimited views until expiry
      validate: {
        validator: function (v) {
          return v === null || (Number.isInteger(v) && v >= 1 && v <= 1000);
        },
        message: 'maxViews must be between 1 and 1000, or null for unlimited',
      },
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'revoked', 'expired', 'exhausted'],
      default: 'active',
      index: true,
    },
    tokenId: {
      type: String,
      required: true,
      unique: true,
    },
    lockToFirstDevice: {
      type: Boolean,
      default: false,
    },
    requireRecipientLogin: {
      type: Boolean,
      default: false,
    },
    boundSession: {
      type: String,
      default: null,
    },
    boundAt: {
      type: Date,
      default: null,
    },
    note: {
      type: String,
      default: '',
      maxlength: [300, 'Note cannot exceed 300 characters'],
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedReason: {
      type: String,
      default: null,
    },
    lastAccessedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for owner dashboards and document share lookups
sharePermissionSchema.index({ sharedBy: 1, createdAt: -1 });
sharePermissionSchema.index({ document: 1, createdAt: -1 });
sharePermissionSchema.index({ sharedBy: 1, status: 1 });

/**
 * Virtual getter for dynamic status computation
 * Returns computed status if the database hasn't been updated yet
 */
sharePermissionSchema.virtual('computedStatus').get(function () {
  if (this.status === 'revoked') return 'revoked';
  if (new Date() > this.expiresAt) return 'expired';
  if (this.maxViews !== null && this.viewCount >= this.maxViews) return 'exhausted';
  return 'active';
});

export const SharePermission = mongoose.model('SharePermission', sharePermissionSchema);
