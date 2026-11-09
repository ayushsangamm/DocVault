import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

import { startBenchmarkServer, stopBenchmarkServer, benchmarkState, setBenchmarkStreamSize } from './server.js';
import accessRoutes from '../backend/src/routes/accessRoutes.js';
import { verifyViewerTicket } from '../backend/src/services/shareTokenService.js';
import { isBlacklisted } from '../backend/src/services/blacklistService.js';
import { SharePermission } from '../backend/src/models/SharePermission.js';
import { Document } from '../backend/src/models/Document.js';
import { getPrivateDownloadUrl } from '../backend/src/services/cloudinaryService.js';
import { ApiError } from '../backend/src/utils/ApiError.js';

// Add the buffered comparison route to accessRoutes for benchmarking
accessRoutes.get('/stream-buffered', async (req, res, next) => {
  try {
    const ticket = req.query.ticket;
    if (!ticket) throw ApiError.unauthorized('Viewer ticket missing', 'TICKET_MISSING');

    const decoded = verifyViewerTicket(ticket);
    const { jti } = decoded;

    const blacklisted = await isBlacklisted(jti);
    if (blacklisted) throw ApiError.forbidden('Share revoked', 'SHARE_REVOKED');

    const share = await SharePermission.findById(jti);
    if (!share || share.status === 'revoked' || new Date() > share.expiresAt) {
      throw ApiError.forbidden('Share expired', 'SHARE_EXPIRED');
    }

    const document = await Document.findById(share.document).select('+cloudinaryPublicId');
    if (!document) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');

    const signedUrl = getPrivateDownloadUrl(document.cloudinaryPublicId, '', document.resourceType);
    const cloudRes = await fetch(signedUrl);

    // BUFFERED VERSION: Download whole file into memory before sending
    const arrayBuffer = await cloudRes.arrayBuffer();
    const fullBuffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', document.mimeType || 'application/pdf');
    res.setHeader('Content-Length', fullBuffer.length);
    res.end(fullBuffer);
  } catch (err) {
    next(err);
  }
});

function measureHttpStream(url) {
  return new Promise((resolve, reject) => {
    let ttfb = null;
    let totalBytes = 0;
    let peakRss = process.memoryUsage().rss;

    const memSampler = setInterval(() => {
      const currentRss = process.memoryUsage().rss;
      if (currentRss > peakRss) {
        peakRss = currentRss;
      }
    }, 2);

    const t0 = performance.now();

    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        clearInterval(memSampler);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      res.on('data', (chunk) => {
        if (ttfb === null) {
          ttfb = performance.now() - t0;
        }
        totalBytes += chunk.length;
        const currentRss = process.memoryUsage().rss;
        if (currentRss > peakRss) peakRss = currentRss;
      });

      res.on('end', () => {
        clearInterval(memSampler);
        const totalTime = performance.now() - t0;
        resolve({
          ttfb: Number((ttfb || totalTime).toFixed(2)),
          totalTime: Number(totalTime.toFixed(2)),
          totalBytes,
          peakRssBytes: peakRss,
          peakRssMB: Number((peakRss / (1024 * 1024)).toFixed(2)),
          statusCode: res.statusCode,
        });
      });

      res.on('error', (err) => {
        clearInterval(memSampler);
        reject(err);
      });
    });

    req.on('error', (err) => {
      clearInterval(memSampler);
      reject(err);
    });
  });
}

export async function runStreamingBenchmark() {
  console.log(`\n======================================================`);
  console.log(` Part B.3: File Streaming Proxy vs Buffered Benchmark`);
  console.log(`======================================================\n`);

  await startBenchmarkServer(4002);
  const ticket = benchmarkState.viewerTicket;

  const fileSizes = [
    { label: '1 MB', bytes: 1 * 1024 * 1024 },
    { label: '10 MB', bytes: 10 * 1024 * 1024 },
    { label: '50 MB', bytes: 50 * 1024 * 1024 },
  ];

  const results = [];

  for (const { label, bytes } of fileSizes) {
    console.log(`\n--- Benchmarking ${label} File (${(bytes / (1024 * 1024)).toFixed(0)} MB) ---`);
    setBenchmarkStreamSize(bytes);

    await new Promise((r) => setTimeout(r, 300));

    // 1. Measure Streamed Proxy
    const streamUrl = `${benchmarkState.baseUrl}/api/access/stream?ticket=${ticket}`;
    const streamMetrics = await measureHttpStream(streamUrl);

    await new Promise((r) => setTimeout(r, 300));

    // 2. Measure Buffered Proxy
    const bufferedUrl = `${benchmarkState.baseUrl}/api/access/stream-buffered?ticket=${ticket}`;
    const bufferedMetrics = await measureHttpStream(bufferedUrl);

    const memoryDiffBytes = Math.max(0, bufferedMetrics.peakRssBytes - streamMetrics.peakRssBytes);
    const memoryDiffMB = Number((memoryDiffBytes / (1024 * 1024)).toFixed(2));

    const summary = {
      fileSize: label,
      bytes,
      stream: {
        ttfbMs: streamMetrics.ttfb,
        totalTimeMs: streamMetrics.totalTime,
        peakRssMB: streamMetrics.peakRssMB,
        totalBytesReceived: streamMetrics.totalBytes,
      },
      buffered: {
        ttfbMs: bufferedMetrics.ttfb,
        totalTimeMs: bufferedMetrics.totalTime,
        peakRssMB: bufferedMetrics.peakRssMB,
        totalBytesReceived: bufferedMetrics.totalBytes,
      },
      memoryDifferenceMB: memoryDiffMB,
    };

    results.push(summary);

    console.log(`  [Streamed] TTFB: ${summary.stream.ttfbMs} ms | Total: ${summary.stream.totalTimeMs} ms | Peak RSS: ${summary.stream.peakRssMB} MB | Bytes: ${summary.stream.totalBytesReceived}`);
    console.log(`  [Buffered] TTFB: ${summary.buffered.ttfbMs} ms | Total: ${summary.buffered.totalTimeMs} ms | Peak RSS: ${summary.buffered.peakRssMB} MB | Bytes: ${summary.buffered.totalBytesReceived}`);
    console.log(`  [Memory Comparison] Peak RSS: Streamed = ${summary.stream.peakRssMB} MB vs Buffered = ${summary.buffered.peakRssMB} MB (Delta: ${summary.memoryDifferenceMB} MB)`);
  }

  await stopBenchmarkServer();

  return results;
}

if (process.argv[1]?.endsWith('4_file_streaming_benchmark.js')) {
  runStreamingBenchmark().catch(console.error);
}
