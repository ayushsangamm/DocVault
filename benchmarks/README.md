# DocVault Performance Benchmark Suite 🚀

Automated load tests and latency benchmarks producing **real, measured numbers** using **Autocannon** and Node's high-resolution performance timers.

---

## Directory Structure

```
benchmarks/
├── server.js                       # Dedicated benchmark server (clean DB, in-memory mocks, rate-limit pass-through)
├── run-all.js                      # Master runner executing all benchmark suites
├── 1_bcrypt_hash_benchmark.js      # Bcrypt Cost 12 hash and compare duration benchmarks
├── 2_login_benchmark.js            # Login endpoint under 10 and 50 concurrent connections (30s)
├── 3_document_access_benchmark.js  # Document metadata access under 50 and 100 concurrent connections (30s)
└── 4_file_streaming_benchmark.js   # 1 MB, 10 MB, 50 MB proxy streaming vs buffered memory benchmarks
```

---

## How to Run

### Run Master Benchmark Suite
```bash
npm run benchmark
```
*Direct runner:*
```bash
node benchmarks/run-all.js
```

### Run Individual Benchmark Suites

#### 1. Bcrypt Cost Factor & Hash Time Benchmark
Measures bcrypt cost factor (12 rounds) computation duration:
```bash
npm run benchmark:bcrypt
```

#### 2. Login Endpoint (Bcrypt) Load Benchmark
Executes 30-second load tests on `POST /api/auth/login` at 10 and 50 concurrent connections:
```bash
npm run benchmark:login
```

#### 3. Document Access Endpoint Load Benchmark
Executes 30-second load tests on `GET /api/documents/:id` and `POST /api/access/open` at 50 and 100 concurrent connections:
```bash
npm run benchmark:access
```

#### 4. File Streaming Proxy vs. Buffered Memory Benchmark
Measures TTFB, transfer time, and peak process RSS memory for 1 MB, 10 MB, and 50 MB files:
```bash
npm run benchmark:streaming
```

