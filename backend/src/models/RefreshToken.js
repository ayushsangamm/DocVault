import mongoose from 'mongoose';

/**
 * Refresh Token Model
 * 
 * WHY:
 * 1. `tokenHash`: We NEVER store raw refresh tokens in the database. If the DB is
 *    dumped, attackers cannot authenticate because SHA-256 is a one-way function.
 * 2. `family`: Tracks a cryptographic rotation chain. If a rotated (old) token is
 *    presented again, it signals token theft (reuse attack). We revoke the whole family.
 * 3. `expiresAt`: Configured with a MongoDB TTL index so expired tokens are automatically
 *    purged by MongoDB's background task after 7 days.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    replacedBy: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: '',
    },
    ip: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically purge records once expiresAt is reached
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
