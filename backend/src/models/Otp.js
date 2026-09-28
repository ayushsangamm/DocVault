import mongoose from 'mongoose';

/**
 * OTP Model (Email Verification)
 * 
 * WHY:
 * 1. `otpHash`: We store the SHA-256 hash of the 6-digit OTP, NEVER raw plaintext.
 *    If the database is read or dumped, the attacker cannot read valid OTPs.
 * 2. TTL Index on `expiresAt`: Automatically purges expired OTP records after
 *    300 seconds (5 minutes) without requiring manual cron cleanup.
 */
const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB TTL index to automatically purge records once expiresAt is reached
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = mongoose.model('Otp', otpSchema);
