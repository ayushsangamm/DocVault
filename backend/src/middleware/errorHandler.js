import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import multer from 'multer';

/**
 * Global Error Handler Middleware
 * 
 * WHY:
 * 1. Consistent JSON error contracts across all endpoints.
 * 2. Never leak internal database stack traces, file system paths, or Cloudinary error
 *    signatures to the client in production responses.
 * 3. Graceful translation of Multer, Mongoose, and Zod exceptions into friendly errors.
 */
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let errors = err.errors || [];

  // Handle Multer upload errors
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      code = 'FILE_TOO_LARGE';
      message = 'File size exceeds the 10 MB maximum upload limit.';
    } else {
      code = 'UPLOAD_ERROR';
      message = `Upload failed: ${err.message}`;
    }
  }

  // Handle Mongoose duplicate key errors (e.g. unique email)
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0] || 'Field';
    message = `An account with that ${field} already exists.`;
  }

  // Handle Mongoose cast errors (e.g. invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'Requested resource not found.';
  }

  // Log server errors to stderr
  if (statusCode >= 500) {
    console.error('[Unhandled Server Error]', err);
  }

  res.status(statusCode).json({
    success: false,
    code,
    message,
    errors,
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
}
