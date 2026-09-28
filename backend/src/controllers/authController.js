import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Otp } from '../models/Otp.js';
import { ApiError } from '../utils/ApiError.js';
import { getClientInfo } from '../utils/clientInfo.js';
import {
  generateAccessToken,
  createRefreshTokenRecord,
  rotateRefreshToken,
  revokeRefreshToken,
  getRefreshCookieOptions,
  compareDummyPassword,
} from '../services/tokenService.js';
import { sendOtpEmail } from '../services/emailService.js';

/**
 * Auth Controller - Hybrid Security Model
 * 
 * 1. New user registration (Signup): MUST require email OTP verification. An account cannot
 *    be created unless the 6-digit OTP sent via Resend is verified.
 * 2. Existing user login (Login): Direct Email + Password verification using bcrypt (cost factor 12)
 *    with timing-attack prevention. No OTP friction for login.
 * 3. No dummy bypasses: All credentials and OTP codes are strictly validated.
 */

export const sendOtpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const verifySignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number'),
  otp: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d{6}$/, 'Verification code must be numeric'),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Step 1: Send Registration OTP via Resend
 */
export async function sendSignupOtp(req, res) {
  const { email } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  // Check if a user already exists with this email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ApiError(
      409,
      'An account with this email already exists. Please log in with your password.',
      'EMAIL_EXISTS'
    );
  }

  // Generate cryptographically secure 6-digit numeric OTP
  const otpNumber = crypto.randomInt(100000, 1000000);
  const otp = otpNumber.toString();

  // Hash OTP using SHA-256 (Never store plaintext in database)
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  // Clean up any existing pending OTPs for this email to prevent multiple valid codes
  await Otp.deleteMany({ email: normalizedEmail });

  // Save new OTP record with 5-minute TTL expiration
  await Otp.create({
    email: normalizedEmail,
    otpHash,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
  });

  // Dispatch OTP email via Resend
  await sendOtpEmail(normalizedEmail, otp);

  res.status(200).json({
    success: true,
    message: 'Verification code sent to your email',
  });
}

/**
 * Step 2: Verify OTP and Complete Registration
 */
export async function verifyAndSignup(req, res) {
  const { name, email, password, otp } = req.body;
  const normalizedEmail = email.toLowerCase().trim();
  const clientInfo = getClientInfo(req);

  // Check if user already registered in the interim
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ApiError(
      409,
      'An account with this email already exists. Please log in with your password.',
      'EMAIL_EXISTS'
    );
  }

  // Look up OTP record
  const otpRecord = await Otp.findOne({ email: normalizedEmail });
  if (!otpRecord) {
    throw ApiError.badRequest('OTP expired or invalid. Please request a new one.', 'OTP_INVALID');
  }

  // Check if expired
  if (new Date() > otpRecord.expiresAt) {
    await Otp.deleteOne({ _id: otpRecord._id });
    throw ApiError.badRequest('OTP expired or invalid. Please request a new one.', 'OTP_EXPIRED');
  }

  // Compare SHA-256 hash
  const providedOtpHash = crypto.createHash('sha256').update(otp.toString().trim()).digest('hex');
  if (providedOtpHash !== otpRecord.otpHash) {
    throw ApiError.badRequest('Invalid verification code', 'OTP_MISMATCH');
  }

  // Delete verified OTP record immediately to prevent replay attacks
  await Otp.deleteOne({ _id: otpRecord._id });

  // Hash password using bcrypt cost factor 12
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  // Issue tokens
  const accessToken = generateAccessToken(user);
  const { rawToken } = await createRefreshTokenRecord({
    user,
    userAgent: clientInfo.userAgent,
    ip: clientInfo.ip,
  });

  // Set secure HTTP-only refresh cookie
  res.cookie('refreshToken', rawToken, getRefreshCookieOptions());

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
}

/**
 * Existing User Login: Direct Email + Password (No OTP friction)
 */
export async function login(req, res) {
  const { email, password } = req.body;
  const normalizedEmail = email.toLowerCase().trim();
  const clientInfo = getClientInfo(req);

  // Query user by lowercase email, explicitly selecting passwordHash
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    // Mitigate timing attacks by comparing against pre-computed dummy hash
    await compareDummyPassword(password);
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const accessToken = generateAccessToken(user);
  const { rawToken } = await createRefreshTokenRecord({
    user,
    userAgent: clientInfo.userAgent,
    ip: clientInfo.ip,
  });

  res.cookie('refreshToken', rawToken, getRefreshCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
}

/**
 * Silent Refresh Token Rotation
 */
export async function refresh(req, res) {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
  const clientInfo = getClientInfo(req);

  if (!rawToken) {
    throw ApiError.unauthorized('Refresh token missing', 'TOKEN_MISSING');
  }

  const { newRawToken, userId } = await rotateRefreshToken(rawToken, {
    userAgent: clientInfo.userAgent,
    ip: clientInfo.ip,
  });

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.unauthorized('User not found', 'USER_NOT_FOUND');
  }

  const accessToken = generateAccessToken(user);
  res.cookie('refreshToken', newRawToken, getRefreshCookieOptions());

  res.status(200).json({
    success: true,
    accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
}

/**
 * Logout
 */
export async function logout(req, res) {
  const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }

  res.clearCookie('refreshToken', getRefreshCookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
}

/**
 * Get Authenticated User Profile
 */
export async function getMe(req, res) {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt,
    },
  });
}

// Backward-compatible alias for existing tests/routes
export const signup = verifyAndSignup;
