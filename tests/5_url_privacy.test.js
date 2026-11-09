import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { User } from '../backend/src/models/User.js';
import { Document } from '../backend/src/models/Document.js';
import { SharePermission } from '../backend/src/models/SharePermission.js';
import { AccessLog } from '../backend/src/models/AccessLog.js';
import { createShareToken, createViewerTicket } from '../backend/src/services/shareTokenService.js';

describe('Part A.5: URL Privacy Suite (Zero Public Cloudinary URL Exposure)', () => {
  let authToken;
  let ownerUser;
  let documentRecord;
  let shareRecord;
  let shareToken;
  let viewerTicket;
  let auditLogRecord;
  let refreshTokenCookie;

  let responsesScanned = 0;
  let responsesLeaking = 0;
  const scannedEndpoints = [];

  function scanResponse(name, res) {
    responsesScanned++;
    const bodyStr = (res.text || JSON.stringify(res.body || {})).toLowerCase();
    const headersStr = JSON.stringify(res.headers || {}).toLowerCase();

    const bodyLeaked = bodyStr.includes('cloudinary.com');
    const headerLeaked = headersStr.includes('cloudinary.com');

    if (bodyLeaked || headerLeaked) {
      responsesLeaking++;
      console.error(`[LEAK DETECTED] Endpoint ${name} leaked cloudinary.com!`);
    }

    scannedEndpoints.push({
      endpoint: name,
      status: res.status,
      bodyLeaked,
      headerLeaked,
    });

    expect(bodyLeaked).toBe(false);
    expect(headerLeaked).toBe(false);
  }

  beforeAll(async () => {
    await connectTestDB();

    // 1. Setup User and Auth
    const email = 'privacy_owner@docvault.io';
    const otp = '789123';
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const signupRes = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '10.50.1.1')
      .send({
        name: 'Privacy Owner',
        email,
        password: 'Password123!',
        otp,
      });

    // In case user needs direct creation if OTP record wasn't present
    if (signupRes.status !== 201) {
      ownerUser = await User.create({
        name: 'Privacy Owner',
        email,
        passwordHash: 'dummy_hash',
      });
      const { generateAccessToken } = await import('../backend/src/services/tokenService.js');
      authToken = generateAccessToken(ownerUser);
    } else {
      authToken = signupRes.body.accessToken;
      ownerUser = await User.findOne({ email });
      const cookies = signupRes.headers['set-cookie'];
      if (cookies) {
        refreshTokenCookie = cookies.find((c) => c.startsWith('refreshToken=')).split(';')[0];
      }
    }

    // 2. Setup Document
    documentRecord = await Document.create({
      title: 'Top Secret Financial Statements',
      originalName: 'Financials_Q4.pdf',
      owner: ownerUser._id,
      cloudinaryPublicId: 'docvault_authenticated_sec_asset_998',
      resourceType: 'raw',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 1048576,
    });

    // 3. Setup Share
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    shareRecord = await SharePermission.create({
      _id: shareId,
      document: documentRecord._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'auditor@bigfour.com',
      permission: 'view',
      maxViews: 10,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
      lockToFirstDevice: false,
    });

    shareToken = createShareToken({
      sharePermissionId: shareRecord._id,
      documentId: documentRecord._id,
      permission: shareRecord.permission,
      expiresAt,
    });

    viewerTicket = createViewerTicket({
      sharePermissionId: shareRecord._id,
    });

    // 4. Setup Audit Log
    auditLogRecord = await AccessLog.create({
      document: documentRecord._id,
      sharePermission: shareRecord._id,
      owner: ownerUser._id,
      actor: { type: 'recipient', email: 'auditor@bigfour.com' },
      action: 'viewed',
      ip: '10.50.1.20',
      userAgent: 'Mozilla/5.0 Auditor Browser',
      deviceLabel: 'Windows • Chrome',
    });
  });

  afterAll(async () => {
    console.log(`[Part A.5 URL Privacy Report] Total responses scanned: ${responsesScanned}`);
    console.log(`[Part A.5 URL Privacy Report] Total responses leaking cloudinary.com: ${responsesLeaking}`);
    await clearTestDB();
    await disconnectTestDB();
  });

  it('scans all authentication endpoints for zero cloudinary.com exposure', async () => {
    // 1. Health
    const res1 = await request(app).get('/api/health');
    scanResponse('GET /api/health', res1);

    // 2. /api/auth/send-otp
    const res2 = await request(app).post('/api/auth/send-otp').send({ email: 'new_recipient@docvault.io' });
    scanResponse('POST /api/auth/send-otp', res2);

    // 3. /api/auth/login
    const res3 = await request(app).post('/api/auth/login').send({ email: 'privacy_owner@docvault.io', password: 'Password123!' });
    scanResponse('POST /api/auth/login', res3);

    // 4. /api/auth/me
    const res4 = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/auth/me', res4);

    // 5. /api/auth/refresh
    if (refreshTokenCookie) {
      const res5 = await request(app).post('/api/auth/refresh').set('Cookie', [refreshTokenCookie]);
      scanResponse('POST /api/auth/refresh', res5);
    }
  });

  it('scans document management endpoints for zero cloudinary.com exposure', async () => {
    // 6. POST /api/documents (Upload)
    const dummyPdf = Buffer.from('%PDF-1.4 Mock Upload Content for Security Audit');
    const res6 = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', dummyPdf, 'UploadAudit.pdf')
      .field('title', 'Vaulted Audit Test');
    scanResponse('POST /api/documents (Upload)', res6);

    // 7. GET /api/documents (List)
    const res7 = await request(app).get('/api/documents').set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/documents (List)', res7);

    // 8. GET /api/documents/:id (Detail)
    const res8 = await request(app).get(`/api/documents/${documentRecord._id}`).set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/documents/:id', res8);

    // 9. PATCH /api/documents/:id (Rename)
    const res9 = await request(app).patch(`/api/documents/${documentRecord._id}`).set('Authorization', `Bearer ${authToken}`).send({ title: 'Renamed Secret' });
    scanResponse('PATCH /api/documents/:id', res9);
  });

  it('scans sharing endpoints for zero cloudinary.com exposure', async () => {
    // 10. POST /api/shares (Create)
    const res10 = await request(app)
      .post('/api/shares')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        documentId: documentRecord._id.toString(),
        recipientEmail: 'scan_recipient@docvault.io',
        permission: 'view',
        expiresInHours: 48,
      });
    scanResponse('POST /api/shares (Create)', res10);

    // 11. GET /api/shares (List)
    const res11 = await request(app).get('/api/shares').set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/shares (List)', res11);

    // 12. GET /api/shares/:id (Detail)
    const res12 = await request(app).get(`/api/shares/${shareRecord._id}`).set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/shares/:id', res12);

    // 13. POST /api/shares/:id/reset-lock
    const res13 = await request(app).post(`/api/shares/${shareRecord._id}/reset-lock`).set('Authorization', `Bearer ${authToken}`);
    scanResponse('POST /api/shares/:id/reset-lock', res13);

    // 14. POST /api/shares/:id/regenerate-link
    const res14 = await request(app).post(`/api/shares/${shareRecord._id}/regenerate-link`).set('Authorization', `Bearer ${authToken}`);
    scanResponse('POST /api/shares/:id/regenerate-link', res14);

    // 15. POST /api/shares/:id/revoke
    const res15 = await request(app).post(`/api/shares/${shareRecord._id}/revoke`).set('Authorization', `Bearer ${authToken}`).send({ reason: 'Privacy test' });
    scanResponse('POST /api/shares/:id/revoke', res15);
  });

  it('scans recipient access and proxy file streaming endpoints for zero cloudinary.com exposure', async () => {
    // Active new share for access tests
    const activeShareId = new mongoose.Types.ObjectId();
    const activeShare = await SharePermission.create({
      _id: activeShareId,
      document: documentRecord._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'stream_tester@docvault.io',
      permission: 'view',
      maxViews: 10,
      viewCount: 0,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active',
      tokenId: activeShareId.toString(),
      lockToFirstDevice: false,
    });

    const activeToken = createShareToken({
      sharePermissionId: activeShare._id,
      documentId: documentRecord._id,
      permission: activeShare.permission,
      expiresAt: activeShare.expiresAt,
    });

    // 16. POST /api/access/open
    const res16 = await request(app).post('/api/access/open').send({ token: activeToken });
    scanResponse('POST /api/access/open', res16);

    const ticket = res16.body.viewerTicket;

    // 17. GET /api/access/stream (PROXY STREAMING ENDPOINT - CRITICAL SECURITY BOUNDARY)
    const res17 = await request(app).get(`/api/access/stream?ticket=${ticket}`);
    scanResponse('GET /api/access/stream (Proxy Stream)', res17);

    // 18. POST /api/access/download (on view-only -> 403 response body scanned)
    const res18 = await request(app).post('/api/access/download').send({ token: activeToken });
    scanResponse('POST /api/access/download', res18);

    // 19. POST /api/access/verify-status
    const res19 = await request(app).post('/api/access/verify-status').send({ token: activeToken });
    scanResponse('POST /api/access/verify-status', res19);
  });

  it('scans audit trail and analytics endpoints for zero cloudinary.com exposure', async () => {
    // 20. GET /api/audit (List)
    const res20 = await request(app).get('/api/audit').set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/audit (List)', res20);

    // 21. GET /api/audit/:id (Detail)
    const res21 = await request(app).get(`/api/audit/${auditLogRecord._id}`).set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/audit/:id', res21);

    // 22. GET /api/analytics/summary
    const res22 = await request(app).get('/api/analytics/summary').set('Authorization', `Bearer ${authToken}`);
    scanResponse('GET /api/analytics/summary', res22);

    // 23. DELETE /api/documents/:id
    const res23 = await request(app).delete(`/api/documents/${documentRecord._id}`).set('Authorization', `Bearer ${authToken}`);
    scanResponse('DELETE /api/documents/:id', res23);

    expect(responsesScanned).toBeGreaterThanOrEqual(20);
    expect(responsesLeaking).toBe(0);
  });
});
