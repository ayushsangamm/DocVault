import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { SharePermission } from '../models/SharePermission.js';
import { AccessLog } from '../models/AccessLog.js';
import { createShareToken } from '../services/shareTokenService.js';
import { blacklistToken } from '../services/blacklistService.js';
import { env } from '../config/env.js';

/**
 * DocVault Database Seeder
 * 
 * WHY: Populates initial sample records for local evaluation so that dashboards,
 * audit trails, and analytics charts display realistic data immediately upon first login.
 * WARNING: Clearly labeled demo data. Never executed automatically.
 */
async function seed() {
  console.log('--- DocVault Demo Database Seeding Started ---');
  await connectDB();

  // 1. Create or retrieve demo owner
  const demoEmail = 'demo@docvault.io';
  let demoUser = await User.findOne({ email: demoEmail });

  if (!demoUser) {
    const passwordHash = await bcrypt.hash('Password123!', 12);
    demoUser = await User.create({
      name: 'Jordan Davis',
      email: demoEmail,
      passwordHash,
    });
    console.log(`[Seed] Created Demo User: ${demoEmail} (Password: Password123!)`);
  } else {
    console.log(`[Seed] Demo User already exists: ${demoEmail}`);
  }

  // 2. Clear existing demo documents & shares for this user to avoid duplicates
  await Document.deleteMany({ owner: demoUser._id });
  await SharePermission.deleteMany({ sharedBy: demoUser._id });
  await AccessLog.deleteMany({ owner: demoUser._id });

  // 3. Create Sample Documents
  const doc1 = await Document.create({
    title: 'Q3 Financial Audit & Compliance Report',
    originalName: 'Q3_Financial_Audit_Report.pdf',
    owner: demoUser._id,
    cloudinaryPublicId: 'docvault_demo_sample_doc1',
    resourceType: 'raw',
    mimeType: 'application/pdf',
    fileType: 'pdf',
    sizeBytes: 2450000, // 2.45 MB
  });

  const doc2 = await Document.create({
    title: 'Executive Employment Agreement & NDA',
    originalName: 'Executive_Employment_Agreement_NDA.pdf',
    owner: demoUser._id,
    cloudinaryPublicId: 'docvault_demo_sample_doc2',
    resourceType: 'raw',
    mimeType: 'application/pdf',
    fileType: 'pdf',
    sizeBytes: 1120000, // 1.12 MB
  });

  const doc3 = await Document.create({
    title: 'Certified Medical Clearance Certificate',
    originalName: 'Medical_Clearance_Record.png',
    owner: demoUser._id,
    cloudinaryPublicId: 'docvault_demo_sample_doc3',
    resourceType: 'image',
    mimeType: 'image/png',
    fileType: 'image',
    sizeBytes: 890000, // 890 KB
  });

  console.log('[Seed] Created 3 sample documents');

  // 4. Create Sample Shares
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  // Share 1: ACTIVE, View-only, Lock to First Device
  const share1Id = new mongoose.Types.ObjectId();
  const share1 = await SharePermission.create({
    _id: share1Id,
    document: doc1._id,
    sharedBy: demoUser._id,
    recipientEmail: 'sarah.chen@acmecorp.com',
    permission: 'view',
    maxViews: 5,
    viewCount: 2,
    expiresAt: in7Days,
    status: 'active',
    tokenId: share1Id.toString(),
    lockToFirstDevice: true,
    boundSession: 'demo-session-uuid-sarah',
    boundAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    note: 'Board Audit Review round 3',
    lastAccessedAt: new Date(now.getTime() - 30 * 60 * 1000),
  });

  // Share 2: ACTIVE, Download Allowed
  const share2Id = new mongoose.Types.ObjectId();
  const share2 = await SharePermission.create({
    _id: share2Id,
    document: doc2._id,
    sharedBy: demoUser._id,
    recipientEmail: 'marcus.vance@lawpartners.org',
    permission: 'download',
    maxViews: 3,
    viewCount: 1,
    expiresAt: in3Days,
    status: 'active',
    tokenId: share2Id.toString(),
    lockToFirstDevice: false,
    note: 'Legal signature verification',
    lastAccessedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
  });

  // Share 3: REVOKED by owner
  const share3Id = new mongoose.Types.ObjectId();
  const share3 = await SharePermission.create({
    _id: share3Id,
    document: doc1._id,
    sharedBy: demoUser._id,
    recipientEmail: 'alex.rivera@external-contractor.io',
    permission: 'view',
    maxViews: 1,
    viewCount: 0,
    expiresAt: in7Days,
    status: 'revoked',
    tokenId: share3Id.toString(),
    lockToFirstDevice: false,
    revokedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    revokedReason: 'Project scope canceled by compliance committee',
    note: 'Contractor evaluation',
  });
  // Blacklist in Redis
  await blacklistToken(share3.tokenId, 3600 * 24);

  // Share 4: EXPIRED
  const share4Id = new mongoose.Types.ObjectId();
  const share4 = await SharePermission.create({
    _id: share4Id,
    document: doc3._id,
    sharedBy: demoUser._id,
    recipientEmail: 'hr-verify@healthgroup.net',
    permission: 'view',
    maxViews: 2,
    viewCount: 1,
    expiresAt: pastDate,
    status: 'expired',
    tokenId: share4Id.toString(),
    lockToFirstDevice: false,
    note: 'Annual employee health audit',
    lastAccessedAt: new Date(pastDate.getTime() - 60 * 60 * 1000),
  });

  console.log('[Seed] Created 4 sample shares with realistic lifecycle states');

  // 5. Create Sample Access Logs (Audit Trail)
  const logsToInsert = [
    // Share 1 events
    {
      document: doc1._id,
      sharePermission: share1._id,
      owner: demoUser._id,
      actor: { type: 'owner', email: demoEmail, userId: demoUser._id },
      action: 'share_created',
      ip: '192.168.1.10',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
      deviceLabel: 'Windows 10 • Chrome 128',
      meta: { recipient: 'sarah.chen@acmecorp.com', lockToFirstDevice: true },
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000),
    },
    {
      document: doc1._id,
      sharePermission: share1._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'sarah.chen@acmecorp.com' },
      action: 'viewed',
      ip: '45.12.89.210',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      deviceLabel: 'macOS • Safari 17',
      meta: { viewCount: 1, maxViews: 5 },
      timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    },
    {
      document: doc1._id,
      sharePermission: share1._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'sarah.chen@acmecorp.com' },
      action: 'download_blocked',
      ip: '45.12.89.210',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      deviceLabel: 'macOS • Safari 17',
      meta: { note: 'Recipient attempted download on View-Only document' },
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    },
    {
      document: doc1._id,
      sharePermission: share1._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'sarah.chen@acmecorp.com' },
      action: 'viewed',
      ip: '45.12.89.210',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      deviceLabel: 'macOS • Safari 17',
      meta: { viewCount: 2, maxViews: 5 },
      timestamp: new Date(now.getTime() - 30 * 60 * 1000),
    },
    // Attempt from second device blocked by Device Lock!
    {
      document: doc1._id,
      sharePermission: share1._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'sarah.chen@acmecorp.com' },
      action: 'access_denied_different_device',
      ip: '103.21.244.0',
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/127.0.0.0 Mobile',
      deviceLabel: 'Android 14 • Chrome Mobile',
      meta: { reason: 'Device lock mismatch: Link forwarded or opened on second device' },
      timestamp: new Date(now.getTime() - 15 * 60 * 1000),
    },

    // Share 2 events
    {
      document: doc2._id,
      sharePermission: share2._id,
      owner: demoUser._id,
      actor: { type: 'owner', email: demoEmail, userId: demoUser._id },
      action: 'share_created',
      ip: '192.168.1.10',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
      deviceLabel: 'Windows 10 • Chrome 128',
      meta: { recipient: 'marcus.vance@lawpartners.org', permission: 'download' },
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    },
    {
      document: doc2._id,
      sharePermission: share2._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'marcus.vance@lawpartners.org' },
      action: 'downloaded',
      ip: '198.51.100.42',
      userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Firefox/130.0',
      deviceLabel: 'Ubuntu • Firefox 130',
      meta: { originalName: doc2.originalName },
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },

    // Share 3 events (Revocation)
    {
      document: doc1._id,
      sharePermission: share3._id,
      owner: demoUser._id,
      actor: { type: 'owner', email: demoEmail, userId: demoUser._id },
      action: 'share_revoked',
      ip: '192.168.1.10',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0',
      deviceLabel: 'Windows 10 • Chrome 128',
      meta: { reason: 'Project scope canceled by compliance committee' },
      timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
    {
      document: doc1._id,
      sharePermission: share3._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'alex.rivera@external-contractor.io' },
      action: 'access_denied_revoked',
      ip: '203.0.113.195',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/128.0.0.0',
      deviceLabel: 'Windows 10 • Edge 128',
      meta: { source: 'redis_blacklist' },
      timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    },

    // Share 4 events (Expired)
    {
      document: doc3._id,
      sharePermission: share4._id,
      owner: demoUser._id,
      actor: { type: 'recipient', email: 'hr-verify@healthgroup.net' },
      action: 'access_denied_expired',
      ip: '198.18.0.1',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15',
      deviceLabel: 'iOS 17 • Mobile Safari',
      meta: { expiresAt: pastDate },
      timestamp: new Date(now.getTime() - 45 * 60 * 1000),
    },
  ];

  await AccessLog.insertMany(logsToInsert);
  console.log(`[Seed] Injected ${logsToInsert.length} immutable audit ledger events`);

  // Generate an active test token for Share 1 for easy testing
  const sampleToken = createShareToken({
    sharePermissionId: share1._id,
    documentId: doc1._id,
    permission: share1.permission,
    expiresAt: share1.expiresAt,
  });

  console.log('\n============================================================');
  console.log(' SEEDING COMPLETE');
  console.log(' Demo Login Credentials:');
  console.log('   Email:    demo@docvault.io');
  console.log('   Password: Password123!');
  console.log(' Active Recipient Link for Testing:');
  console.log(`   ${env.CLIENT_URL}/s/${sampleToken}`);
  console.log('============================================================\n');

  await disconnectDB();
}

seed().catch((err) => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
