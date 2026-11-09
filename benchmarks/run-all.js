import { runBcryptBenchmark } from './1_bcrypt_hash_benchmark.js';
import { runLoginBenchmark } from './2_login_benchmark.js';
import { runDocumentAccessBenchmark } from './3_document_access_benchmark.js';
import { runStreamingBenchmark } from './4_file_streaming_benchmark.js';

async function main() {
  console.log('================================================================');
  console.log('       DOCVAULT ENTERPRISE PERFORMANCE BENCHMARK SUITE          ');
  console.log('================================================================\n');

  const startTime = Date.now();

  // Part B.1: Login (Bcrypt)
  const loginResults = await runLoginBenchmark();

  // Part B.2: Document Access
  const docAccessResults = await runDocumentAccessBenchmark();

  // Part B.3: File Streaming Proxy
  const streamingResults = await runStreamingBenchmark();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n================================================================');
  console.log(` ALL BENCHMARKS COMPLETED IN ${elapsed}s`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('[Fatal Benchmark Error]', err);
  process.exit(1);
});

