import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from '../backend/node_modules/mongoose/index.js';
import { Writable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load backend .env before any app code imports
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

// Ensure test database URI is used
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/docvault_test';

// 2. Mock Upstash Redis with In-Memory Store
const { redis } = await import('../backend/src/config/redis.js');
export const redisMemoryStore = new Map();

redis.client.request = async (req) => {
  const results = [];
  if (req?.body && Array.isArray(req?.body)) {
    for (const cmd of req.body) {
      const [op, key, val, ...rest] = cmd;
      const opLower = String(op).toLowerCase();
      if (opLower === 'set') {
        redisMemoryStore.set(key, val);
        results.push({ result: 'OK' });
      } else if (opLower === 'get') {
        results.push({ result: redisMemoryStore.has(key) ? redisMemoryStore.get(key) : null });
      } else if (opLower === 'del') {
        redisMemoryStore.delete(key);
        results.push({ result: 1 });
      } else {
        results.push({ result: 'OK' });
      }
    }
  } else if (req?.path && Array.isArray(req.path)) {
    const opLower = String(req.path[0]).toLowerCase();
    if (opLower === 'ping') {
      return { result: 'PONG' };
    }
  }
  return results;
};

// 3. Mock Cloudinary Upload & Destroy
const { default: cloudinary } = await import('../backend/src/config/cloudinary.js');
cloudinary.uploader.upload_stream = (options, cb) => {
  const stream = new Writable({
    write(chunk, encoding, next) {
      next();
    },
    final(next) {
      const publicId = `mock_cloud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      cb(null, {
        public_id: publicId,
        resource_type: options.resource_type || 'raw',
        bytes: 1024,
        format: options.resource_type === 'image' ? 'png' : 'pdf',
      });
      next();
    },
  });
  return stream;
};

cloudinary.uploader.destroy = async (publicId, options) => {
  return { result: 'ok' };
};

// 4. Mock Global Fetch for Resend Email API and Cloudinary Streaming
const originalFetch = globalThis.fetch;
export let sentEmails = [];

globalThis.fetch = async (url, options = {}) => {
  const urlStr = typeof url === 'string' ? url : url?.url || '';

  if (urlStr.includes('api.resend.com')) {
    let bodyObj = {};
    try {
      if (options.body) {
        bodyObj = JSON.parse(options.body);
      }
    } catch {}
    sentEmails.push({ url: urlStr, ...bodyObj });
    return new Response(JSON.stringify({ id: `msg_mock_${Date.now()}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (urlStr.includes('cloudinary.com') || urlStr.includes('res.cloudinary')) {
    const mockContent = Buffer.from('%PDF-1.4 Mock Stream Data for Zero-Trust File Proxy');
    return new Response(mockContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': mockContent.length.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  return originalFetch(url, options);
};

// 5. Shared Test DB Lifecycle
export async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}

export async function clearTestDB() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    redisMemoryStore.clear();
    sentEmails = [];
  }
}

export async function disconnectTestDB() {
  // In-band runner keeps connection active across suites for fast execution
}

export async function closeTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

// Auto-connect once on test environment setup
await connectTestDB();
