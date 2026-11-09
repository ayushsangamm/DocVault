import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { User } from '../backend/src/models/User.js';
import { Document } from '../backend/src/models/Document.js';
import { SharePermission } from '../backend/src/models/SharePermission.js';
import { AccessLog } from '../backend/src/models/AccessLog.js';
import { createShareToken } from '../backend/src/services/shareTokenService.js';
import { generateAccessToken } from '../backend/src/services/tokenService.js';

describe('Part A.6: Device Lock & Forensic Attempt Logging Suite', () => {
  let ownerUser;
  let testDoc;
  let ownerAuthToken;

  beforeAll(async () => {
    await connectTestDB();
    ownerUser = await User.create({
      name: 'Device Lock Owner',
      email: 'device_lock_owner@docvault.io',
      passwordHash: 'dummy_hash',
    });
    ownerAuthToken = generateAccessToken(ownerUser);

    testDoc = await Document.create({
      title: 'Restricted Executive Dossier',
      originalName: 'Dossier.pdf',
      owner: ownerUser._id,
      cloudinaryPublicId: 'mock_device_lock_doc_id',
      resourceType: 'raw',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 300000,
    });
  });

  afterAll(async () => {
    await clearTestDB();
    await disconnectTestDB();
  });

  it('enforces hardware/device lock to first device, blocks secondary device B, and verifies forensic audit logging', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'strictly_locked@docvault.io',
      permission: 'view',
      maxViews: 10,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
      lockToFirstDevice: true, // HARDWARE LOCK ENABLED
    });

    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: share.permission,
      expiresAt,
    });

    // CASE 1: Device A (Authorized Recipient Browser) opens link for the first time
    const deviceAUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
    const deviceAIp = '192.168.10.55';

    const resDeviceA = await request(app)
      .post('/api/access/open')
      .set('User-Agent', deviceAUA)
      .set('X-Forwarded-For', deviceAIp)
      .send({ token });

    expect(resDeviceA.status).toBe(200);
    expect(resDeviceA.body.success).toBe(true);

    // Verify secure session cookie was set
    const cookies = resDeviceA.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookieHeader = cookies.find((c) => c.startsWith('share_sess='));
    expect(sessionCookieHeader).toBeDefined();
    const deviceACookie = sessionCookieHeader.split(';')[0];

    // Verify database record has bound session
    const boundShare = await SharePermission.findById(share._id);
    expect(boundShare.boundSession).toBeTruthy();
    expect(boundShare.boundAt).toBeInstanceOf(Date);

    // CASE 2: Device B (Attacker / Forwarded Recipient) attempts access WITHOUT cookie
    const deviceBUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Firefox/130.0';
    const deviceBIp = '203.0.113.88';

    const resDeviceB_NoCookie = await request(app)
      .post('/api/access/open')
      .set('User-Agent', deviceBUA)
      .set('X-Forwarded-For', deviceBIp)
      .send({ token });

    expect(resDeviceB_NoCookie.status).toBe(403);
    expect(resDeviceB_NoCookie.body.code).toBe('DEVICE_LOCK_MISMATCH');

    // CASE 3: Device B attempts access with a FORGED / INVALID cookie
    const resDeviceB_ForgedCookie = await request(app)
      .post('/api/access/open')
      .set('User-Agent', deviceBUA)
      .set('X-Forwarded-For', deviceBIp)
      .set('Cookie', ['share_sess=forged-session-uuid-12345'])
      .send({ token });

    expect(resDeviceB_ForgedCookie.status).toBe(403);
    expect(resDeviceB_ForgedCookie.body.code).toBe('DEVICE_LOCK_MISMATCH');

    // CASE 4: Verify forensic audit logging of the blocked Device B attempts
    const mismatchLogs = await AccessLog.find({
      sharePermission: share._id,
      action: 'access_denied_different_device',
    });

    expect(mismatchLogs.length).toBe(2);
    expect(mismatchLogs[0].ip).toBe(deviceBIp);
    expect(mismatchLogs[0].userAgent).toBe(deviceBUA);
    expect(mismatchLogs[0].meta.reason).toContain('Device lock mismatch');

    // CASE 5: Device A returns with its valid bound cookie -> succeeds seamlessly
    const resDeviceA_Return = await request(app)
      .post('/api/access/open')
      .set('User-Agent', deviceAUA)
      .set('X-Forwarded-For', deviceAIp)
      .set('Cookie', [deviceACookie])
      .send({ token });

    expect(resDeviceA_Return.status).toBe(200);
    expect(resDeviceA_Return.body.success).toBe(true);

    // CASE 6: Owner resets the device lock -> Device B can now bind as new primary device
    const resetRes = await request(app)
      .post(`/api/shares/${share._id}/reset-lock`)
      .set('Authorization', `Bearer ${ownerAuthToken}`);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    const resDeviceB_AfterReset = await request(app)
      .post('/api/access/open')
      .set('User-Agent', deviceBUA)
      .set('X-Forwarded-For', deviceBIp)
      .send({ token });

    expect(resDeviceB_AfterReset.status).toBe(200);
    expect(resDeviceB_AfterReset.body.success).toBe(true);

    console.log('[Part A.6 Device Lock Report] All 6/6 test cases verified.');
  });
});

