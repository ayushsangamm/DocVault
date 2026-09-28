import mongoose from 'mongoose';

/**
 * Document Model
 * 
 * WHY:
 * 1. Storage URLs are strictly forbidden from being stored or exposed. Only
 *    the `cloudinaryPublicId` exists server-side.
 * 2. Every recipient streaming / download request must be proxied through our API
 *    so permissions and revocations are actively validated on every byte transfer.
 */
const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
      select: false, // Never return in public or standard owner queries unless explicitly requested internally
    },
    resourceType: {
      type: String,
      enum: ['image', 'raw'],
      required: true,
      default: 'raw',
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['pdf', 'image', 'other'],
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for owner dashboard queries (sort by newest)
documentSchema.index({ owner: 1, createdAt: -1 });

export const Document = mongoose.model('Document', documentSchema);
