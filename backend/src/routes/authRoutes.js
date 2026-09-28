import { Router } from 'express';
import {
  sendSignupOtp,
  verifyAndSignup,
  login,
  refresh,
  logout,
  getMe,
  sendOtpSchema,
  verifySignupSchema,
  loginSchema,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { otpLimiter, authLimiter, refreshLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Step 1: Request 6-digit OTP for new user registration (rate limited: 5 / 15min)
router.post('/send-otp', otpLimiter, validate(sendOtpSchema), asyncHandler(sendSignupOtp));

// Step 2: Verify OTP and create account (rate limited)
router.post('/signup', authLimiter, validate(verifySignupSchema), asyncHandler(verifyAndSignup));

// Direct Login: Email + Password without OTP friction
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(login));

// Session rotation & management
router.post('/refresh', refreshLimiter, asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));
router.get('/me', authenticate, asyncHandler(getMe));

export default router;
