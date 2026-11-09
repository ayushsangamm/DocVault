import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { User } from '../backend/src/models/User.js';
import { Document } from '../backend/src/models/Document.js';
import { SharePermission } from '../backend/src/models/SharePermission.js';
import { createShareToken, createViewerTicket } from '../backend/src/services/shareTokenService.js';

describe('Part A.1: Link Expiry Suite (1hr, 1day, 7day windows)', () => {
  let ownerUser;
  let testDoc;

  beforeAll(async () => {
    await connectTestDB();
    ownerUser = await User.create({
      name: 'Expiry Owner',
      email: 'expiry_owner@docvault.io',
      passwordHash: 'dummy_hash',
    });

    testDoc = await Document.create({
      title: 'Board Meeting Minutes',
      originalName: 'Minutes.pdf',
      owner: ownerUser._id,
      cloudinaryPublicId: 'mock_expiry_doc_id',
      resourceType: 'raw',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 204800,
    });
  });

  afterAll(async () => {
    await clearTestDB();
    await disconnectTestDB();
  });

  const windows = [
    { label: '1 hour window', hours: 1, ms: 1 * 60 * 60 * 1000 },
    { label: '1 day window (24h)', hours: 24, ms: 24 * 60 * 60 * 1000 },
    { label: '7 days window (168h)', hours: 168, ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  for (const win of windows) {
    it(`validates access BEFORE and AFTER expiry for ${win.label}`, async () => {
      const shareId = new mongoose.Types.ObjectId();
      const expiresAt = new Date(Date.now() + win.ms);

      const share = await SharePermission.create({
        _id: shareId,
        document: testDoc._id,
        sharedBy: ownerUser._id,
        recipientEmail: `recipient_${win.hours}h@docvault.io`,
        permission: 'view',
        maxViews: 10,
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

      // CASE 1: Before expiry -> must succeed (200 OK)
      const resBefore = await request(app).post('/api/access/open').send({ token });
      expect(resBefore.status).toBe(200);
      expect(resBefore.body.success).toBe(true);
      expect(resBefore.body.viewerTicket).toBeDefined();

      // CASE 2: Simulate time passage past expiry by updating expiresAt to past
      share.expiresAt = new Date(Date.now() - 5000);
      await share.save();

      // CASE 2: After expiry -> must be rejected (403 SHARE_EXPIRED)
      const resAfter = await request(app).post('/api/access/open').send({ token });
      expect(resAfter.status).toBe(403);
      expect(resAfter.body.code).toBe('SHARE_EXPIRED');

      // Database status check: lazy evaluation updates status to 'expired'
      const updatedShare = await SharePermission.findById(share._id);
      expect(updatedShare.status).toBe('expired');
    });
  }

  it('rejects streaming via /api/access/stream when grant expires', async () => {
    const shareId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 60000); // 1 minute in future

    const share = await SharePermission.create({
      _id: shareId,
      document: testDoc._id,
      sharedBy: ownerUser._id,
      recipientEmail: 'stream_expiry@docvault.io',
      permission: 'view',
      maxViews: 10,
      viewCount: 0,
      expiresAt,
      status: 'active',
      tokenId: shareId.toString(),
    });

    const ticket = createViewerTicket({ sharePermissionId: share._id });

    // Stream before expiry works
    const streamBefore = await request(app).get(`/api/access/stream?ticket=${ticket}`);
    expect(streamBefore.status).toBe(200);

    // Fast-forward share expiry into the past
    share.expiresAt = new Date(Date.now() - 10000);
    await share.save();

    // Stream after expiry is rejected with 403
    const streamAfter = await request(app).get(`/api/access/stream?ticket=${ticket}`);
    expect(streamAfter.status).toBe(403);
    expect(streamAfter.body.code).toBe('SHARE_EXPIRED');
  });
});

