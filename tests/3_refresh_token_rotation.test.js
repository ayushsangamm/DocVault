import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { User } from '../backend/src/models/User.js';
import { RefreshToken } from '../backend/src/models/RefreshToken.js';
import { createRefreshTokenRecord, hashToken } from '../backend/src/services/tokenService.js';

describe('Part A.3: Refresh Token Rotation & Multi-Device Reuse Invalidation', () => {
  let testUser;
  const userPassword = 'RotationPassword123!';
  const userEmail = 'multi_device_user@docvault.io';
  const M = 5;

  beforeAll(async () => {
    await connectTestDB();
    const passwordHash = await bcrypt.hash(userPassword, 10);
    testUser = await User.create({
      name: 'Multi Device User',
      email: userEmail,
      passwordHash,
    });
  });

  afterAll(async () => {
    await clearTestDB();
    await disconnectTestDB();
  });

  it(`creates M=${M} sessions from different devices, reuses an already-rotated token, and checks session invalidation`, async () => {
    const devices = [
      { name: 'MacBook Pro • Chrome 128', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0', ip: '192.168.1.101' },
      { name: 'iPhone 15 • Safari 17', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', ip: '192.168.1.102' },
      { name: 'Windows 11 • Edge 128', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/128.0.0.0', ip: '192.168.1.103' },
      { name: 'Ubuntu • Firefox 130', ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', ip: '192.168.1.104' },
      { name: 'iPad Pro • Mobile Safari', ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', ip: '192.168.1.105' },
    ];

    expect(devices.length).toBe(M);

    // 1. Log in from M=5 devices
    const deviceSessions = [];
    for (let i = 0; i < M; i++) {
      const dev = devices[i];
      const { rawToken, record } = await createRefreshTokenRecord({
        user: testUser,
        userAgent: dev.ua,
        ip: dev.ip,
      });

      deviceSessions.push({
        deviceIndex: i,
        device: dev,
        rawToken,
        recordId: record._id,
        family: record.family,
      });
    }

    const totalSessionsCreated = await RefreshToken.countDocuments({ user: testUser._id });
    expect(totalSessionsCreated).toBe(M);

    // 2. Device 0 rotates its refresh token legitimately
    const dev0 = deviceSessions[0];
    const rotateRes = await request(app)
      .post('/api/auth/refresh')
      .set('User-Agent', dev0.device.ua)
      .set('X-Forwarded-For', dev0.device.ip)
      .set('Cookie', [`refreshToken=${dev0.rawToken}`]);

    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.success).toBe(true);

    const cookies = rotateRes.headers['set-cookie'];
    const newCookie = cookies.find((c) => c.startsWith('refreshToken='));
    const dev0NewRawToken = newCookie.split(';')[0].split('=')[1];

    // Verify old token is now marked revoked
    const dev0OldRecord = await RefreshToken.findById(dev0.recordId);
    expect(dev0OldRecord.revoked).toBe(true);

    // 3. REUSE ATTACK: Attacker replays Device 0's old, already-rotated token
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('User-Agent', 'HackerBrowser/1.0')
      .set('X-Forwarded-For', '203.0.113.50')
      .set('Cookie', [`refreshToken=${dev0.rawToken}`]);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('TOKEN_REUSE_DETECTED');

    // 4. Verify whether ALL M=5 sessions for that user are invalidated
    // Check in database how many sessions for this user are now revoked
    const allUserTokens = await RefreshToken.find({ user: testUser._id });
    const revokedTokensCount = allUserTokens.filter((t) => t.revoked).length;

    console.log(`[Part A.3 Session Report] Total created: ${totalSessionsCreated}, Revoked after reuse: ${revokedTokensCount}/${allUserTokens.length}`);

    // Test each device's ability to refresh
    // Device 0 rotated token:
    const dev0Check = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${dev0NewRawToken}`]);

    // Devices 1 to 4:
    const otherDeviceChecks = [];
    for (let i = 1; i < M; i++) {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${deviceSessions[i].rawToken}`]);
      otherDeviceChecks.push({ deviceIndex: i, status: res.status, code: res.body?.code });
    }

    const otherDevicesBlocked = otherDeviceChecks.filter((c) => c.status === 401).length;
    console.log(`[Part A.3 Devices Blocked] Active tokens blocked: ${otherDevicesBlocked}/${M - 1} other devices`);

    // Verify all sessions are invalidated
    expect(dev0Check.status).toBe(401);
    expect(otherDevicesBlocked).toBe(M - 1);
    expect(revokedTokensCount).toBe(allUserTokens.length);
  });
});

