/**
 * Standardized API Error Class
 * 
 * WHY: Provides predictable error formats across all routes and controllers,
 * containing specific HTTP status codes and machine-readable `code` identifiers
 * (e.g., 'SHARE_REVOKED', 'DEVICE_LOCK_MISMATCH') that the frontend client can map
 * directly to custom error screens without relying on fragile string comparisons.
 */
export class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code = 'BAD_REQUEST', errors = []) {
    return new ApiError(400, message, code, errors);
  }

  static unauthorized(message = 'Unauthorized access', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Access forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new ApiError(500, message, code);
  }
}
