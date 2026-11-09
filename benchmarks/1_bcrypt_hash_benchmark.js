import bcrypt from 'bcryptjs';
import { performance } from 'perf_hooks';

export async function runBcryptBenchmark(rounds = 10, costFactor = 12) {
  console.log(`\n======================================================`);
  console.log(` Running Bcrypt Benchmark (Cost Factor: ${costFactor}, ${rounds} iterations)...`);
  console.log(`======================================================`);

  const password = 'BenchmarkPassword123!';
  const hashTimes = [];
  const compareTimes = [];

  for (let i = 1; i <= rounds; i++) {
    // 1. Measure hash generation time
    const t0 = performance.now();
    const hash = await bcrypt.hash(password, costFactor);
    const t1 = performance.now();
    const hashTime = t1 - t0;
    hashTimes.push(hashTime);

    // 2. Measure compare time
    const t2 = performance.now();
    const match = await bcrypt.compare(password, hash);
    const t3 = performance.now();
    const compareTime = t3 - t2;
    compareTimes.push(compareTime);

    process.stdout.write(`  Iteration ${i}/${rounds}: Hash = ${hashTime.toFixed(1)}ms, Compare = ${compareTime.toFixed(1)}ms\n`);
  }

  const avgHashTime = hashTimes.reduce((a, b) => a + b, 0) / hashTimes.length;
  const avgCompareTime = compareTimes.reduce((a, b) => a + b, 0) / compareTimes.length;
  const minHashTime = Math.min(...hashTimes);
  const maxHashTime = Math.max(...hashTimes);

  console.log(`\n--- Bcrypt Benchmark Results ---`);
  console.log(`  Bcrypt Cost Factor:  ${costFactor}`);
  console.log(`  Average Hash Time:   ${avgHashTime.toFixed(2)} ms (min: ${minHashTime.toFixed(1)}ms, max: ${maxHashTime.toFixed(1)}ms)`);
  console.log(`  Average Verify Time: ${avgCompareTime.toFixed(2)} ms`);
  console.log(`--------------------------------\n`);

  return {
    costFactor,
    rounds,
    avgHashTime: Number(avgHashTime.toFixed(2)),
    avgCompareTime: Number(avgCompareTime.toFixed(2)),
    minHashTime: Number(minHashTime.toFixed(2)),
    maxHashTime: Number(maxHashTime.toFixed(2)),
  };
}

if (process.argv[1]?.endsWith('1_bcrypt_hash_benchmark.js')) {
  runBcryptBenchmark(10, 12).catch(console.error);
}

