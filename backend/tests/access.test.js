import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Document } from '../src/models/Document.js';
import { SharePermission } from '../src/models/SharePermission.js';
import { createShareToken } from '../src/services/shareTokenService.js';
import { blacklistToken } from '../src/services/blacklistService.js';

describe('Recipient Access, Check Order, & Revocation Test Suite', () => {
  let ownerUser;
  let testDoc;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

    ownerUser = await User.create({
      name: 'Access Test Owner',
      email: `access_test_${Date.now()}@docvault.io`,
      passwordHash: 'dummy_hash_for_test',
    });

    testDoc = await Document.create({
      title: 'Confidential Medical Record',
      originalName: 'Medical_Record.pdf',
      owner: ownerUser._id,
      cloudinaryPublicId: 'sample_cloudinary_id',
      resourceType: 'raw',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 102400,
    });
  });

  afterAll(async () => {
    await Document.deleteMany({ owner: ownerUser._id });
    await SharePermission.deleteMany({ sharedBy: ownerUser._id });
    await User.deleteMany({ _id: ownerUser._id });
    await disconnectDB();
  });

  it('successfully opens an active share link and returns a viewer ticket', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'recipient1@example.com',
      permission: 'view',
      maxViews: 3,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
      lockToFirstDevice: false,
    });

    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: share.permission,
      expiresAt,
    });

    const res = await request(app).post('/api/access/open').send({ token });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.document.title).toBe(testDoc.title);
    expect(res.body.viewerTicket).toBeDefined();
    expect(res.body.share.viewCount).toBe(1);
    expect(res.body.share.remainingViews).toBe(2);
  });

  it('denies access to an expired share link', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() - 1000 * 60); // 1 minute in the past

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'recipient_expired@example.com',
      permission: 'view',
      maxViews: 5,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
    });

    // Create token with expired timestamp
    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: share.permission,
      expiresAt,
    });

    const res = await request(app).post('/api/access/open').send({ token });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHARE_EXPIRED');
  });

  it('denies access to an instantly revoked share link via Redis blacklist', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'revoked_target@example.com',
      permission: 'view',
      maxViews: 10,
      viewCount: 0,
      expiresAt,
      status: 'revoked',
      tokenId: shareId.toString(),
    });

    // Add to Redis blacklist
    await blacklistToken(shareId.toString(), 3600);

    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: share.permission,
      expiresAt,
    });

    const res = await request(app).post('/api/access/open').send({ token });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHARE_REVOKED');
  });

  it('exhausts access once maxViews limit is reached', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'single_view@example.com',
      permission: 'view',
      maxViews: 1, // Single use!
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
    });

    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: share.permission,
      expiresAt,
    });

    // First view succeeds
    const firstRes = await request(app).post('/api/access/open').send({ token });
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.share.remainingViews).toBe(0);

    // Second view must return 403 SHARE_EXHAUSTED
    const secondRes = await request(app).post('/api/access/open').send({ token });
    expect(secondRes.status).toBe(403);
    expect(secondRes.body.code).toBe('SHARE_EXHAUSTED');
  });

  it('enforces Device Lock and rejects access from a different device', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'locked_recipient@example.com',
      permission: 'view',
      maxViews: 10,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
      lockToFirstDevice: true,
      boundSession: null, // Initial state: unbound
    });

    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: share.permission,
      expiresAt,
    });

    // 1. Device A opens the document (Binds cookie)
    const deviceARes = await request(app).post('/api/access/open').send({ token });
    expect(deviceARes.status).toBe(200);

    const cookies = deviceARes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const shareSessCookie = cookies.find((c) => c.startsWith('share_sess='));
    expect(shareSessCookie).toBeDefined();

    // 2. Device A opens again with same cookie (Allowed)
    const deviceASecondRes = await request(app)
      .post('/api/access/open')
      .set('Cookie', [shareSessCookie])
      .send({ token });
    expect(deviceASecondRes.status).toBe(200);

    // 3. Device B opens the document with NO cookie or DIFFERENT cookie (Rejected!)
    const deviceBRes = await request(app).post('/api/access/open').send({ token });
    expect(deviceBRes.status).toBe(403);
    expect(deviceBRes.body.code).toBe('DEVICE_LOCK_MISMATCH');
  });

  it('blocks download requests on view-only documents', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'view_only_user@example.com',
      permission: 'view', // View-only!
      maxViews: 5,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
    });

    const token = createShareToken({
      sharePermissionId: share._id,
      documentId: testDoc._id,
      permission: 'view',
      expiresAt,
    });

    const res = await request(app).post('/api/access/download').send({ token });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DOWNLOAD_FORBIDDEN');
  });
});
