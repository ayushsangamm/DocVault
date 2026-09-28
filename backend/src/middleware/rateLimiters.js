import rateLimit from 'express-rate-limit';

/**
 * Rate Limiting Middleware Suite
 * 
 * WHY:
 * 1. `authLimiter`: Prevents brute-force credential stuffing and password guessing.
 * 2. `accessLimiter`: Protects public `/api/access` endpoints against denial-of-service
 *    attacks and token enumeration attempts.
 * 3. `standardLimiter`: General protection for authenticated API endpoints.
 */

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 OTP requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many verification code requests from this IP. Please wait 15 minutes.',
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts from this IP. Please try again in 15 minutes.',
  },
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 refresh attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many session refresh calls. Please try again shortly.',
  },
});

export const accessLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests on this secure document link. Please slow down.',
  },
});

export const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
});
