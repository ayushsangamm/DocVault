import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { User } from '../backend/src/models/User.js';
import { Document } from '../backend/src/models/Document.js';
import { SharePermission } from '../backend/src/models/SharePermission.js';
import { createShareToken } from '../backend/src/services/shareTokenService.js';

describe('Part A.2: View Cap Race Condition Suite (50 concurrent requests x 20 runs)', () => {
  let ownerUser;
  let testDoc;
  const K = 5;
  const CONCURRENT_REQUESTS = 50;
  const TOTAL_RUNS = 20;

  beforeAll(async () => {
    await connectTestDB();
    ownerUser = await User.create({
      name: 'Race Condition Owner',
      email: 'race_owner@docvault.io',
      passwordHash: 'dummy_hash',
    });

    testDoc = await Document.create({
      title: 'Top Secret Strategy',
      originalName: 'Strategy.pdf',
      owner: ownerUser._id,
      cloudinaryPublicId: 'mock_race_doc_id',
      resourceType: 'raw',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 512000,
    });
  });

  afterAll(async () => {
    await clearTestDB();
    await disconnectTestDB();
  });

  it(`executes ${TOTAL_RUNS} runs of ${CONCURRENT_REQUESTS} concurrent requests with maxViews=${K} and asserts exactly ${K} succeed per run`, async () => {
    let exactKRuns = 0;
    const runSummaries = [];

    for (let run = 1; run <= TOTAL_RUNS; run++) {
      const shareId = new mongoose.Types.ObjectId();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const share = await SharePermission.create({
        _id: shareId,
        document: testDoc._id,
        sharedBy: ownerUser._id,
        recipientEmail: `race_recipient_run${run}@docvault.io`,
        permission: 'view',
        maxViews: K,
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

      // Fire 50 concurrent access requests
      const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
        request(app)
          .post('/api/access/open')
          .set('X-Forwarded-For', `10.${run}.${Math.floor(i / 250)}.${(i % 250) + 1}`)
          .send({ token })
      );

      const responses = await Promise.all(promises);

      const successCount = responses.filter((r) => r.status === 200).length;
      const exhaustedCount = responses.filter(
        (r) => r.status === 403 && r.body.code === 'SHARE_EXHAUSTED'
      ).length;

      // Verify in DB that viewCount is capped at K
      const dbShare = await SharePermission.findById(share._id);

      runSummaries.push({
        run,
        successCount,
        exhaustedCount,
        dbViewCount: dbShare.viewCount,
      });

      // If it ever exceeds K, that is a severe bug
      expect(successCount).toBeLessThanOrEqual(K);
      expect(dbShare.viewCount).toBe(K);

      if (successCount === K) {
        exactKRuns++;
      }
    }

    console.log(`[Part A.2 Race Summary] Exactly ${K} succeeded in ${exactKRuns}/${TOTAL_RUNS} runs.`);
    expect(exactKRuns).toBe(TOTAL_RUNS);
  }, 120000);
});

