import autocannon from 'autocannon';
import { startBenchmarkServer, stopBenchmarkServer, benchmarkState } from './server.js';

export async function runDocumentAccessBenchmark() {
  console.log(`\n======================================================`);
  console.log(` Part B.2: Document Access Endpoint Load Benchmark`);
  console.log(`======================================================\n`);

  await startBenchmarkServer(4001);

  const docId = benchmarkState.document._id.toString();
  const token = benchmarkState.shareToken;

  const results = [];

  // Suite A: Authenticated Document Access (GET /api/documents/:id - Auth + Metadata)
  console.log(`\n>>> Suite A: Authenticated Owner Access (GET /api/documents/:id) <<<`);
  for (const connections of [50, 100]) {
    console.log(`\n[Autocannon] Firing ${connections} concurrent connections for 30s on GET /api/documents/:id...`);

    const result = await autocannon({
      url: `${benchmarkState.baseUrl}/api/documents/${docId}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${benchmarkState.authToken}`,
      },
      connections,
      duration: 30,
      pipelining: 1,
    });

    const summary = {
      endpoint: 'GET /api/documents/:id (Owner Auth + Metadata)',
      connections,
      duration: 30,
      p50: result.latency.p50,
      p95: result.latency.p97_5, // 97.5th percentile
      p99: result.latency.p99,
      meanLatency: Number(result.latency.mean.toFixed(2)),
      requestsPerSec: Number(result.requests.average.toFixed(2)),
      totalRequests: result.requests.total,
      throughputBytesPerSec: Number(result.throughput.average.toFixed(2)),
      non2xx: result.non2xx,
      errors: result.errors,
      timeouts: result.timeouts,
    };

    results.push(summary);

    console.log(`--- Results for ${connections} Connections (30s) ---`);
    console.log(`  Requests/sec: ${summary.requestsPerSec}`);
    console.log(`  Latency p50:  ${summary.p50} ms`);
    console.log(`  Latency p95:  ${summary.p95} ms (97.5th pct)`);
    console.log(`  Latency p99:  ${summary.p99} ms`);
    console.log(`  Total Req:    ${summary.totalRequests}`);
    console.log(`  Non-2xx:      ${summary.non2xx}`);
    console.log(`-----------------------------------------------`);

    await new Promise((r) => setTimeout(r, 1000));
  }

  // Suite B: Recipient Access (POST /api/access/open - Cryptographic Token + Redis + Mongo Check)
  console.log(`\n>>> Suite B: Recipient Grant Access (POST /api/access/open) <<<`);
  for (const connections of [50, 100]) {
    console.log(`\n[Autocannon] Firing ${connections} concurrent connections for 30s on POST /api/access/open...`);

    const result = await autocannon({
      url: `${benchmarkState.baseUrl}/api/access/open`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      connections,
      duration: 30,
      pipelining: 1,
    });

    const summary = {
      endpoint: 'POST /api/access/open (Share Token + Redis + Metadata)',
      connections,
      duration: 30,
      p50: result.latency.p50,
      p95: result.latency.p97_5,
      p99: result.latency.p99,
      meanLatency: Number(result.latency.mean.toFixed(2)),
      requestsPerSec: Number(result.requests.average.toFixed(2)),
      totalRequests: result.requests.total,
      throughputBytesPerSec: Number(result.throughput.average.toFixed(2)),
      non2xx: result.non2xx,
      errors: result.errors,
      timeouts: result.timeouts,
    };

    results.push(summary);

    console.log(`--- Results for ${connections} Connections (30s) ---`);
    console.log(`  Requests/sec: ${summary.requestsPerSec}`);
    console.log(`  Latency p50:  ${summary.p50} ms`);
    console.log(`  Latency p95:  ${summary.p95} ms (97.5th pct)`);
    console.log(`  Latency p99:  ${summary.p99} ms`);
    console.log(`  Total Req:    ${summary.totalRequests}`);
    console.log(`  Non-2xx:      ${summary.non2xx}`);
    console.log(`-----------------------------------------------`);

    await new Promise((r) => setTimeout(r, 1000));
  }

  await stopBenchmarkServer();

  return results;
}

if (process.argv[1]?.endsWith('3_document_access_benchmark.js')) {
  runDocumentAccessBenchmark().catch(console.error);
}
