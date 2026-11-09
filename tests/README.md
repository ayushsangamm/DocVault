# DocVault Automated Correctness Test Suite 🧪

Automated test suite using **Jest** and **Supertest** covering cryptographic link expiry, atomic view quota race conditions, refresh token rotation with multi-device reuse detection, OTP verification & rate limiting, zero-exposure URL privacy, device lock enforcement, and cross-tenant authorization isolation.

All tests execute against local MongoDB and strictly mock Cloudinary, email sending (Resend), and Upstash Redis.

---

## Directory Structure

```
tests/
├── setup.js                        # Test database lifecycle, in-memory Redis, and Cloudinary/Resend mocks
├── 1_link_expiry.test.js           # 1hr, 1day, 7day windows access before/after expiry
├── 2_view_cap_race.test.js         # 50 concurrent requests x 20 runs view cap race condition
├── 3_refresh_token_rotation.test.js# Multi-device session rotation & token theft detection
├── 4_otp.test.js                   # Expired, wrong, reused OTP & rate limit blocking
├── 5_url_privacy.test.js           # Full API response & stream proxy scan for zero Cloudinary URLs
├── 6_device_lock.test.js           # Hardware lock, secondary device blocking & forensic audit logs
└── 7_authorization.test.js         # Cross-tenant ID harvesting & resource access blocking
```

---

## How to Run

### Run All Correctness Tests
```bash
npm test
```
*Direct Jest command:*
```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
```

### Run Individual Test Suites
```bash
# 1. Link Expiry Suite
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/1_link_expiry.test.js

# 2. View Cap Race Condition Suite (50 concurrent requests x 20 runs)
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/2_view_cap_race.test.js

# 3. Refresh Token Rotation Suite (Multi-Device Reuse Detection)
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/3_refresh_token_rotation.test.js

# 4. OTP Verification & Rate Limiting Suite
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/4_otp.test.js

# 5. URL Privacy & Storage Secrecy Suite
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/5_url_privacy.test.js

# 6. Device Lock & Forensic Logging Suite
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/6_device_lock.test.js

# 7. Cross-Tenant Authorization Suite
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/7_authorization.test.js
```

---

## Test Coverage Summary

| Test Group | Target Endpoint(s) | Scenarios Verified | Status |
| :--- | :--- | :--- | :--- |
| **1. Link Expiry** | `POST /api/access/open`<br>`GET /api/access/stream` | 1hr, 24hr, 7day windows before/after expiry + stream expiration | **4 / 4 Passed** |
| **2. View Cap Race Condition** | `POST /api/access/open` | 50 concurrent access bursts across 20 distinct runs ($K=5$) | **20 / 20 Runs Exact $K$** |
| **3. Refresh Token Rotation** | `POST /api/auth/refresh` | M=5 device sessions, rotated token reuse triggers account-wide revocation | **5 / 5 Sessions Invalidated** |
| **4. OTP & Rate Limiting** | `POST /api/auth/signup` | Expired OTP, wrong OTP, consumed OTP replay, and 100-attempt rate limiting | **4 / 4 Passed** (15 allowed, 85 blocked) |
| **5. URL Privacy** | All 22 API endpoints + Stream | Scans all body payloads and headers for `"cloudinary.com"` | **22 Scanned / 0 Leaking** |
| **6. Device Lock** | `POST /api/access/open`<br>`POST /api/shares/:id/reset-lock` | Primary device binding, secondary device blocking, forensic audit logging | **6 / 6 Passed** |
| **7. Authorization** | `/api/documents/*`<br>`/api/shares/*`<br>`/api/audit/*` | Cross-tenant reading, renaming, deleting, and sharing of unauthorized documents | **12 / 12 Attempts Blocked** |

