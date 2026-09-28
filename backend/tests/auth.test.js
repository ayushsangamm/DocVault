import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Otp } from '../src/models/Otp.js';
import { RefreshToken } from '../src/models/RefreshToken.js';

describe('Auth, OTP Verification & Session Rotation Suite', () => {
  const testEmail = `test_owner_${Date.now()}@docvault.io`;
  const testPassword = 'SecurePassword123!';
  const testOtp = '849201';
  let accessToken = '';
  let refreshTokenCookie = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await User.deleteMany({ email: testEmail });
    await Otp.deleteMany({ email: testEmail });
    await disconnectDB();
  });

  it('rejects OTP dispatch for invalid email format', async () => {
    const res = await request(app).post('/api/auth/send-otp').send({
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('successfully generates and hashes OTP in database on /send-otp', async () => {
    const res = await request(app).post('/api/auth/send-otp').send({
      email: testEmail,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Verification code sent');

    // Verify OTP record exists in MongoDB with hashed value
    const otpRecord = await Otp.findOne({ email: testEmail });
    expect(otpRecord).toBeDefined();
    expect(otpRecord.otpHash).toBeDefined();
    expect(otpRecord.otpHash).not.toBe(testOtp); // Must be a SHA-256 hash, never raw
  });

  it('rejects signup with mismatched or invalid OTP', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Test Owner',
      email: testEmail,
      password: testPassword,
      otp: '000000', // Wrong OTP
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_MISMATCH');
  });

  it('successfully registers new user with verified OTP and returns tokens', async () => {
    // Set a known OTP hash directly in DB for deterministic verification test
    const knownOtp = '654321';
    const otpHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
    await Otp.deleteMany({ email: testEmail });
    await Otp.create({
      email: testEmail,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const res = await request(app).post('/api/auth/signup').send({
      name: 'Test Owner',
      email: testEmail,
      password: testPassword,
      otp: knownOtp,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);

    // Verify refresh token cookie is set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Path=/api/auth');

    accessToken = res.body.accessToken;
    refreshTokenCookie = refreshCookie.split(';')[0];

    // Verify OTP was deleted immediately to prevent replay
    const remainingOtp = await Otp.findOne({ email: testEmail });
    expect(remainingOtp).toBeNull();
  });

  it('prevents replay: second signup attempt with same OTP fails', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Test Owner',
      email: testEmail,
      password: testPassword,
      otp: '654321',
    });

    // Email already exists or OTP already consumed
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 409 Conflict when requesting OTP for an already registered email', async () => {
    const res = await request(app).post('/api/auth/send-otp').send({
      email: testEmail,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });

  it('allows direct login for registered user with email + password (no OTP required)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: testPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);

    const cookies = res.headers['set-cookie'];
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    refreshTokenCookie = refreshCookie.split(';')[0];
  });

  it('rejects wrong password on login with generic message to prevent timing attacks', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: 'WrongPassword123!',
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('allows access to protected /me endpoint with Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
  });

  it('rotates refresh token and detects reuse to invalidate the token family', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshTokenCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();

    const cookies = res.headers['set-cookie'];
    const newRefreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    expect(newRefreshCookie).toBeDefined();

    const oldCookieToReplay = refreshTokenCookie;
    const activeRotatedCookie = newRefreshCookie.split(';')[0];

    // REUSE DETECTION TEST: Replaying old already-rotated cookie
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [oldCookieToReplay]);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('TOKEN_REUSE_DETECTED');

    // Subsequent call with newest cookie must also fail because entire family was revoked!
    const familyCheckRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [activeRotatedCookie]);

    expect(familyCheckRes.status).toBe(401);
  });
});
