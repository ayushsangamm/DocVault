import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from '../backend/node_modules/mongoose/index.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const BENCH_MONGO_URI = 'mongodb://localhost:27017/docvault_bench';

// 1. Mock Upstash Redis with In-Memory Map
const { redis } = await import('../backend/src/config/redis.js');
export const benchRedisStore = new Map();

redis.client.request = async (req) => {
  const results = [];
  if (req?.body && Array.isArray(req?.body)) {
    for (const cmd of req.body) {
      const [op, key, val] = cmd;
      const opLower = String(op).toLowerCase();
      if (opLower === 'set') {
        benchRedisStore.set(key, val);
        results.push({ result: 'OK' });
      } else if (opLower === 'get') {
        results.push({ result: benchRedisStore.has(key) ? benchRedisStore.get(key) : null });
      } else if (opLower === 'del') {
        benchRedisStore.delete(key);
        results.push({ result: 1 });
      } else {
        results.push({ result: 'OK' });
      }
    }
  } else if (req?.path && Array.isArray(req.path)) {
    if (String(req.path[0]).toLowerCase() === 'ping') {
      return { result: 'PONG' };
    }
  }
  return results;
};

// 2. Global Mock Fetch for Cloudinary / Resend
const originalFetch = globalThis.fetch;
export let streamFileSize = 1 * 1024 * 1024; // Default 1 MB

globalThis.fetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : url?.url || '';

  if (urlStr.includes('api.resend.com')) {
    return new Response(JSON.stringify({ id: 'bench_msg_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (urlStr.includes('cloudinary.com') || urlStr.includes('res.cloudinary')) {
    const chunk = Buffer.alloc(streamFileSize, 0x41); // 'A' bytes
    return new Response(chunk, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': streamFileSize.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  return originalFetch(url, options);
};

export function setBenchmarkStreamSize(bytes) {
  streamFileSize = bytes;
}

// 3. Import Express App & Routes
const { default: app } = await import('../backend/src/app.js');
const { default: authRoutes } = await import('../backend/src/routes/authRoutes.js');
const { default: accessRoutes } = await import('../backend/src/routes/accessRoutes.js');
const { default: documentRoutes } = await import('../backend/src/routes/documentRoutes.js');

const { User } = await import('../backend/src/models/User.js');
const { Document } = await import('../backend/src/models/Document.js');
const { SharePermission } = await import('../backend/src/models/SharePermission.js');
const { generateAccessToken } = await import('../backend/src/services/tokenService.js');
const { createShareToken, createViewerTicket } = await import('../backend/src/services/shareTokenService.js');

// 4. Bypass Rate Limiters specifically for Load Benchmarks
// (Bypasses express-rate-limit so autocannon measures raw CPU/database execution capacity)
const passThrough = (req, res, next) => next();

for (const s of authRoutes.stack) {
  if (s.route && s.route.stack?.[0]) {
    s.route.stack[0].handle = passThrough;
  }
}
if (accessRoutes.stack?.[0]) {
  accessRoutes.stack[0].handle = passThrough;
}
if (documentRoutes.stack?.[1]) {
  documentRoutes.stack[1].handle = passThrough;
}

export let benchmarkState = {
  server: null,
  port: 4000,
  baseUrl: 'http://127.0.0.1:4000',
  user: null,
  authToken: null,
  document: null,
  share: null,
  shareToken: null,
  viewerTicket: null,
};

export async function startBenchmarkServer(port = 4000) {
  benchmarkState.port = port;
  benchmarkState.baseUrl = `http://127.0.0.1:${port}`;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(BENCH_MONGO_URI);
  }

  // Clean bench collections
  await User.deleteMany({});
  await Document.deleteMany({});
  await SharePermission.deleteMany({});
  benchRedisStore.clear();

  // Seed benchmark user (using bcrypt cost 12 password hash)
  const password = 'BenchPassword123!';
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name: 'Benchmark User',
    email: 'bench_user@docvault.io',
    passwordHash,
  });
  const authToken = generateAccessToken(user);

  // Seed document
  const document = await Document.create({
    title: 'Benchmark Performance Document',
    originalName: 'BenchmarkDoc.pdf',
    owner: user._id,
    cloudinaryPublicId: 'bench_cloudinary_public_id',
    resourceType: 'raw',
    mimeType: 'application/pdf',
    fileType: 'pdf',
    sizeBytes: 1048576,
  });

  // Seed share permission
  const shareId = new mongoose.Types.ObjectId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const share = await SharePermission.create({
    _id: shareId,
    document: document._id,
    sharedBy: user._id,
    recipientEmail: 'bench_recipient@docvault.io',
    permission: 'view',
    maxViews: null, // Unlimited views for benchmark load test
    viewCount: 0,
    expiresAt,
    status: 'active',
    tokenId: shareId.toString(),
    lockToFirstDevice: false,
  });

  const shareToken = createShareToken({
    sharePermissionId: share._id,
    documentId: document._id,
    permission: share.permission,
    expiresAt,
  });

  const viewerTicket = createViewerTicket({
    sharePermissionId: share._id,
  });

  benchmarkState.user = user;
  benchmarkState.authToken = authToken;
  benchmarkState.document = document;
  benchmarkState.share = share;
  benchmarkState.shareToken = shareToken;
  benchmarkState.viewerTicket = viewerTicket;

  return new Promise((resolve) => {
    benchmarkState.server = app.listen(port, () => {
      console.log(`[Benchmark Server] Running on ${benchmarkState.baseUrl}`);
      resolve(benchmarkState);
    });
  });
}

export async function stopBenchmarkServer() {
  if (benchmarkState.server) {
    await new Promise((resolve) => benchmarkState.server.close(resolve));
    console.log('[Benchmark Server] HTTP server closed.');
  }
  // Allow pending event loop and database writes to drain
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log('[Benchmark Server] Database disconnected cleanly.');
  }
}
