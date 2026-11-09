import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../backend/src/app.js';
import { connectTestDB, clearTestDB, disconnectTestDB } from './setup.js';
import { User } from '../backend/src/models/User.js';
import { Document } from '../backend/src/models/Document.js';
import { SharePermission } from '../backend/src/models/SharePermission.js';
import { AccessLog } from '../backend/src/models/AccessLog.js';
import { generateAccessToken } from '../backend/src/services/tokenService.js';

describe('Part A.7: Cross-Tenant Authorization & ID Isolation Suite', () => {
  let victimUser;
  let attackerUser;
  let victimToken;
  let attackerToken;
  let victimDoc;
  let victimShare;
  let victimAuditLog;

  beforeAll(async () => {
    await connectTestDB();

    // 1. Legitimate Resource Owner (Victim / Alice)
    victimUser = await User.create({
      name: 'Alice Victim',
      email: 'alice_victim@docvault.io',
      passwordHash: 'dummy_hash_alice',
    });
    victimToken = generateAccessToken(victimUser);

    // 2. Authenticated Cross-Tenant User (Attacker / Bob with valid JWT)
    attackerUser = await User.create({
      name: 'Bob Attacker',
      email: 'bob_attacker@docvault.io',
      passwordHash: 'dummy_hash_bob',
    });
    attackerToken = generateAccessToken(attackerUser);

    // 3. Alice's confidential document
    victimDoc = await Document.create({
      title: "Alice's Secret Strategy",
      originalName: 'Secret.pdf',
      owner: victimUser._id,
      cloudinaryPublicId: 'alice_secret_doc_id',
      resourceType: 'raw',
      mimeType: 'application/pdf',
      fileType: 'pdf',
      sizeBytes: 100000,
    });

    // 4. Alice's share permission
    const shareId = new mongoose.Types.ObjectId();
    victimShare = await SharePermission.create({
      _id: shareId,
      document: victimDoc._id,
      sharedBy: victimUser._id,
      recipientEmail: 'partner@enterprise.com',
      permission: 'view',
      maxViews: 5,
      viewCount: 1,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'active',
      tokenId: shareId.toString(),
      lockToFirstDevice: false,
    });

    // 5. Alice's audit event
    victimAuditLog = await AccessLog.create({
      document: victimDoc._id,
      sharePermission: victimShare._id,
      owner: victimUser._id,
      actor: { type: 'owner', email: victimUser.email, userId: victimUser._id },
      action: 'share_created',
      ip: '10.0.0.1',
      deviceLabel: 'Alice MacBook',
    });
  });

  afterAll(async () => {
    await clearTestDB();
    await disconnectTestDB();
  });

  it('attempts 12 unauthorized access vectors against another user’s resources and verifies 100% are blocked', async () => {
    let attemptsTotal = 0;
    let attemptsBlocked = 0;

    const testAttempt = (name, isBlocked) => {
      attemptsTotal++;
      if (isBlocked) {
        attemptsBlocked++;
      } else {
        console.error(`[AUTHORIZATION BREACH] Vector failed: ${name}`);
      }
      expect(isBlocked).toBe(true);
    };

    // Vector 1: GET /api/documents/:id (Fetch Alice's document directly)
    const res1 = await request(app)
      .get(`/api/documents/${victimDoc._id}`)
      .set('Authorization', `Bearer ${attackerToken}`);
    testAttempt('GET /api/documents/:id', res1.status === 404 && res1.body.code === 'DOCUMENT_NOT_FOUND');

    // Vector 2: PATCH /api/documents/:id (Rename Alice's document)
    const res2 = await request(app)
      .patch(`/api/documents/${victimDoc._id}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ title: 'Hacked Title' });
    testAttempt('PATCH /api/documents/:id', res2.status === 404 && res2.body.code === 'DOCUMENT_NOT_FOUND');

    // Vector 3: DELETE /api/documents/:id (Delete Alice's document)
    const res3 = await request(app)
      .delete(`/api/documents/${victimDoc._id}`)
      .set('Authorization', `Bearer ${attackerToken}`);
    testAttempt('DELETE /api/documents/:id', res3.status === 404 && res3.body.code === 'DOCUMENT_NOT_FOUND');

    // Vector 4: GET /api/documents (List documents: Alice's document must not appear)
    const res4 = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${attackerToken}`);
    const victimDocInList = res4.body.documents?.some((d) => d.id === victimDoc._id.toString());
    testAttempt('GET /api/documents scoping', res4.status === 200 && !victimDocInList);

    // Vector 5: GET /api/shares/:id (View Alice's share permission grant)
    const res5 = await request(app)
      .get(`/api/shares/${victimShare._id}`)
      .set('Authorization', `Bearer ${attackerToken}`);
    testAttempt('GET /api/shares/:id', res5.status === 404 && res5.body.code === 'SHARE_NOT_FOUND');

    // Vector 6: POST /api/shares/:id/revoke (Revoke Alice's share permission)
    const res6 = await request(app)
      .post(`/api/shares/${victimShare._id}/revoke`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ reason: 'Malicious Revocation' });
    testAttempt('POST /api/shares/:id/revoke', res6.status === 404 && res6.body.code === 'SHARE_NOT_FOUND');

    // Vector 7: POST /api/shares/:id/reset-lock (Reset Alice's device lock)
    const res7 = await request(app)
      .post(`/api/shares/${victimShare._id}/reset-lock`)
      .set('Authorization', `Bearer ${attackerToken}`);
    testAttempt('POST /api/shares/:id/reset-lock', res7.status === 404 && res7.body.code === 'SHARE_NOT_FOUND');

    // Vector 8: POST /api/shares/:id/regenerate-link (Regenerate Alice's share link)
    const res8 = await request(app)
      .post(`/api/shares/${victimShare._id}/regenerate-link`)
      .set('Authorization', `Bearer ${attackerToken}`);
    testAttempt('POST /api/shares/:id/regenerate-link', res8.status === 404 && res8.body.code === 'SHARE_NOT_FOUND');

    // Vector 9: GET /api/shares (List shares: Alice's share must not appear)
    const res9 = await request(app)
      .get('/api/shares')
      .set('Authorization', `Bearer ${attackerToken}`);
    const victimShareInList = res9.body.shares?.some((s) => s.id === victimShare._id.toString());
    testAttempt('GET /api/shares scoping', res9.status === 200 && !victimShareInList);

    // Vector 10: GET /api/audit/:id (View Alice's audit log entry)
    const res10 = await request(app)
      .get(`/api/audit/${victimAuditLog._id}`)
      .set('Authorization', `Bearer ${attackerToken}`);
    testAttempt('GET /api/audit/:id', res10.status === 404 && res10.body.code === 'AUDIT_NOT_FOUND');

    // Vector 11: GET /api/audit (List audit logs: Alice's events must not appear)
    const res11 = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${attackerToken}`);
    const victimLogInList = res11.body.logs?.some((l) => l.id === victimAuditLog._id.toString());
    testAttempt('GET /api/audit scoping', res11.status === 200 && !victimLogInList);

    // Vector 12: POST /api/shares (Create a share for Alice's document)
    const res12 = await request(app)
      .post('/api/shares')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({
        documentId: victimDoc._id.toString(),
        recipientEmail: 'intruder@attacker.com',
        permission: 'download',
      });
    testAttempt('POST /api/shares for unauthorized doc', res12.status === 404 && res12.body.code === 'DOCUMENT_NOT_FOUND');

    console.log(`[Part A.7 Authorization Report] Total attempts: ${attemptsTotal}, Blocked: ${attemptsBlocked}/${attemptsTotal} (100%)`);
    expect(attemptsBlocked).toBe(attemptsTotal);
    expect(attemptsTotal).toBe(12);
  });
});

