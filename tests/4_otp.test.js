import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { Otp } from '../backend/src/models/Otp.js';
import { User } from '../backend/src/models/User.js';

describe('Part A.4: OTP Verification & Rate Limiting Suite', () => {
  const baseEmail = 'otp_test_user@docvault.io';
  const testPassword = 'Password123!';

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await clearTestDB();
    await disconnectTestDB();
  });

  it('rejects an expired OTP with 400 OTP_EXPIRED', async () => {
    const email = 'expired_otp@docvault.io';
    const otp = '123456';
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await Otp.create({
      email,
      otpHash,
      expiresAt: new Date(Date.now() - 5000), // 5 seconds in the past
    });

    const res = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '10.10.1.1')
      .send({
        name: 'Expired Tester',
        email,
        password: testPassword,
        otp,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('rejects a wrong/mismatched OTP with 400 OTP_MISMATCH', async () => {
    const email = 'wrong_otp@docvault.io';
    const actualOtp = '112233';
    const wrongOtp = '998877';
    const otpHash = crypto.createHash('sha256').update(actualOtp).digest('hex');

    await Otp.create({
      email,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '10.10.1.2')
      .send({
        name: 'Wrong Tester',
        email,
        password: testPassword,
        otp: wrongOtp,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_MISMATCH');
  });

  it('rejects a reused OTP (deleted immediately on verification to prevent replay)', async () => {
    const email = 'reused_otp@docvault.io';
    const otp = '556677';
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    await Otp.create({
      email,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    // First use: Valid signup
    const firstRes = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '10.10.1.3')
      .send({
        name: 'Replay Tester',
        email,
        password: testPassword,
        otp,
      });

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.success).toBe(true);

    // Second use: Replay attempt with the exact same OTP code
    const secondRes = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '10.10.1.4')
      .send({
        name: 'Attacker Replay',
        email,
        password: testPassword,
        otp,
      });

    // Replay fails: either 409 EMAIL_EXISTS (if same email) or 400 OTP_INVALID (OTP deleted)
    expect(secondRes.status).toBeGreaterThanOrEqual(400);

    // Also verify trying to use that consumed OTP for a different email fails with OTP_INVALID
    const thirdRes = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '10.10.1.5')
      .send({
        name: 'Another Account',
        email: 'different_user@docvault.io',
        password: testPassword,
        otp,
      });

    expect(thirdRes.status).toBe(400);
    expect(thirdRes.body.code).toBe('OTP_INVALID');
  });

  it('tests rate limiting on wrong OTP attempts: fires 100 requests from the same IP and measures blocking point', async () => {
    const rateLimitIp = '198.51.100.77';
    const targetEmail = 'rate_limit_target@docvault.io';
    const realOtp = '888999';
    const otpHash = crypto.createHash('sha256').update(realOtp).digest('hex');

    await Otp.create({
      email: targetEmail,
      otpHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    let allowedAttempts = 0;
    let blockedAttempts = 0;
    const TOTAL_ATTEMPTS = 100;

    for (let i = 1; i <= TOTAL_ATTEMPTS; i++) {
      const res = await request(app)
        .post('/api/auth/signup')
        .set('X-Forwarded-For', rateLimitIp)
        .send({
          name: `Brute Force Attempt ${i}`,
          email: targetEmail,
          password: testPassword,
          otp: '000000', // Intentionally wrong OTP
        });

      if (res.status === 400 && res.body.code === 'OTP_MISMATCH') {
        allowedAttempts++;
      } else if (res.status === 429) {
        blockedAttempts++;
      }
    }

    console.log(`[Part A.4 Rate Limit Report] Total wrong OTP attempts: ${TOTAL_ATTEMPTS}`);
    console.log(`[Part A.4 Rate Limit Report] Allowed before blocking: ${allowedAttempts}`);
    console.log(`[Part A.4 Rate Limit Report] Blocked by rate limiter (HTTP 429): ${blockedAttempts}`);

    // express-rate-limit authLimiter has max: 15
    expect(allowedAttempts).toBe(15);
    expect(blockedAttempts).toBe(85);
    expect(allowedAttempts + blockedAttempts).toBe(TOTAL_ATTEMPTS);
  });
});

