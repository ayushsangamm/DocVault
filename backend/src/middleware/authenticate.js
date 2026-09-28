import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Authentication Middleware
 * 
 * WHY:
 * 1. Verifies Bearer JWT access tokens in the `Authorization` header.
 * 2. If the token is expired, returns `401` with error code `TOKEN_EXPIRED`.
 *    The frontend Axios interceptor catches this exact code to trigger a transparent
 *    silent refresh without logging the user out.
 * 3. Populates `req.user` with the verified database user instance.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token required', 'TOKEN_MISSING');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Access token has expired', 'TOKEN_EXPIRED');
      }
      throw ApiError.unauthorized('Invalid access token', 'TOKEN_INVALID');
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      throw ApiError.unauthorized('User associated with this token no longer exists', 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
