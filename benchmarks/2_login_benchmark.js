import autocannon from 'autocannon';
import { startBenchmarkServer, stopBenchmarkServer, benchmarkState } from './server.js';
import { runBcryptBenchmark } from './1_bcrypt_hash_benchmark.js';

export async function runLoginBenchmark() {
  console.log(`\n======================================================`);
  console.log(` Part B.1: Login Endpoint (Bcrypt Cost 12) Load Benchmark`);
  console.log(`======================================================\n`);

  // 1. Run raw bcrypt hashing benchmark
  const bcryptStats = await runBcryptBenchmark(5, 12);

  // 2. Start server on clean port
  await startBenchmarkServer(4000);

  const loginBody = JSON.stringify({
    email: 'bench_user@docvault.io',
    password: 'BenchPassword123!',
  });

  const testCases = [
    { connections: 10, duration: 30, timeout: 60 },
    { connections: 50, duration: 30, timeout: 60 },
  ];

  const results = [];

  for (const { connections, duration, timeout } of testCases) {
    console.log(`\n[Autocannon] Firing ${connections} concurrent connections for ${duration}s on POST /api/auth/login (timeout: ${timeout}s)...`);

    const result = await autocannon({
      url: `${benchmarkState.baseUrl}/api/auth/login`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: loginBody,
      connections,
      duration,
      timeout,
      pipelining: 1,
    });

    const summary = {
      endpoint: 'POST /api/auth/login',
      connections,
      duration,
      p50: result.latency.p50,
      p95: result.latency.p97_5, // Autocannon provides 97.5th percentile
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
    console.log(`  Timeouts:     ${summary.timeouts}`);
    console.log(`-----------------------------------------------`);

    // Settle between runs
    await new Promise((r) => setTimeout(r, 1000));
  }

  await stopBenchmarkServer();

  return {
    bcryptStats,
    results,
  };
}

if (process.argv[1]?.endsWith('2_login_benchmark.js')) {
  runLoginBenchmark().catch(console.error);
}
