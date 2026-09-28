import mongoose from 'mongoose';

/**
 * User Model (Document Owner)
 * 
 * WHY: `passwordHash` has `select: false` configured directly at the schema level.
 * This guarantees that even if a developer forgets to `.select('-passwordHash')`
 * in an owner or profile query, password hashes are NEVER leaked into JSON responses.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Never return in default queries
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model('User', userSchema);
