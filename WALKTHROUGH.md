# DocVault Engineering Walkthrough & Learning Guide 📘

> **For Learners & Interviewees**: A complete, step-by-step breakdown of authentication, authorization, cryptographic link sharing, and security design decisions in DocVault.

---

## 1. Owner Signup & Login Flow

### Files involved:
- [`backend/src/controllers/authController.js`](file:///d:/Projects/DocVault/backend/src/controllers/authController.js)
- [`backend/src/services/tokenService.js`](file:///d:/Projects/DocVault/backend/src/services/tokenService.js)
- [`backend/src/middleware/authenticate.js`](file:///d:/Projects/DocVault/backend/src/middleware/authenticate.js)

### Step-by-Step Breakdown:
1. **Password Hashing with Bcrypt (Cost 12)**:
   - When an owner signs up via `POST /api/auth/signup`, we validate the password with Zod (min 8 chars, at least 1 letter, 1 number).
   - In `User.js`, `passwordHash` has `select: false`. Even if someone runs `User.find()`, password hashes are **never leaked** into JSON responses.
   - Cost 12 means $2^{12} = 4096$ hashing rounds, significantly slowing down offline dictionary or GPU brute-force attacks.
2. **Timing-Safe Login Comparison**:
   - In `login()`, if an email doesn't exist in MongoDB, instead of immediately returning 401, we run `await compareDummyPassword(password)`.
   - **Why?** Comparing passwords with bcrypt takes ~150-250ms. If we returned immediately in 5ms when an email was not found, an attacker could measure response times to guess which emails exist in the database (User Enumeration).
3. **Dual Token Generation**:
   - We generate a **short-lived Access Token** (15 minutes) and a **random 64-byte Refresh Token** (7 days).
   - The access token is sent in the JSON response body. The frontend stores it **in memory only** (never in localStorage or sessionStorage).
   - The refresh token is saved **hashed with SHA-256** in the database (`RefreshToken` model) and sent to the client as an `httpOnly`, `secure`, `sameSite: 'lax'` cookie scoped strictly to `path: '/api/auth'`.

---

## 2. Refresh Token Rotation & Reuse Detection

### Files involved:
- [`backend/src/services/tokenService.js`](file:///d:/Projects/DocVault/backend/src/services/tokenService.js#L75-L135)
- [`frontend/src/lib/api.js`](file:///d:/Projects/DocVault/frontend/src/lib/api.js)

### Kaam kaise karta hai? (Mechanism):
Traditional JWT apps give a 30-day refresh token. If a hacker steals it, they have access for 30 days. In DocVault, we implement **Refresh Token Rotation (RTR)** with **Reuse Detection**:

1. **Family Chain**:
   - Each login session creates a `family` ID (UUID).
   - Every time the client calls `POST /api/auth/refresh`, we:
     1. Verify the current token hash in MongoDB.
     2. Check if it was already marked `revoked: true`.
     3. Generate a **new** refresh token and link the old one with `replacedBy`.
     4. Save the new token in the same `family`.
2. **Reuse Detection (Token Theft Alarm)**:
   - Agar koi hacker ek old refresh token capture karke replay karta hai:
   - Server dekhta hai: *"Wait, this token was ALREADY rotated and revoked!"*
   - That means token leak hua hai! Server immediately runs:
     ```javascript
     await RefreshToken.updateMany({ family: existingToken.family }, { revoked: true });
     ```
   - Entire session chain invalidate ho jaati hai, and attacker as well as victim dono ko re-login karna padta hai.
3. **Silent Refresh in Frontend**:
   - In `frontend/src/lib/api.js`, on any `401 TOKEN_EXPIRED`, an Axios interceptor catches it, queues any concurrent requests, calls `POST /auth/refresh`, updates the in-memory access token, and retries the original request seamlessly.

---

## 3. Share Token Creation & Signed URLs

### Files involved:
- [`backend/src/controllers/shareController.js`](file:///d:/Projects/DocVault/backend/src/controllers/shareController.js)
- [`backend/src/services/shareTokenService.js`](file:///d:/Projects/DocVault/backend/src/services/shareTokenService.js)

### Kaise banta hai Share Link?
1. Owner configures:
   - `recipientEmail`: Kaun access karega.
   - `permission`: `view` (watermark + download blocked) ya `download`.
   - `expiresInHours`: Max 30 days.
   - `maxViews`: e.g. 1 (single-use), 3, or unlimited.
   - `lockToFirstDevice`: Toggle true/false.
2. Server generates `SharePermission` document with `_id`.
3. Then creates a signed JWT with `SHARE_TOKEN_SECRET`:
   ```javascript
   const payload = {
     jti: sharePermission._id.toString(),
     doc: documentId.toString(),
     perm: permission,
   };
   ```
4. **Key Decision**: We return `${CLIENT_URL}/s/<token>` **only once** upon creation. The raw token is **never stored** in the database. Only the `jti` is kept.

---

## 4. The 7-Step Check Order in `/api/access/open` (Heart of DocVault)

### File: [`backend/src/controllers/accessController.js`](file:///d:/Projects/DocVault/backend/src/controllers/accessController.js#L35-L310)

Jab recipient `/s/<token>` kholta hai, `POST /api/access/open` request aati hai. In checks ka order **bohot critical** hai:

```
[Incoming Request with Token]
        │
        ▼
[STEP 1: Verify JWT Signature & Expiry] ────(Invalid/Tampered)───► Log & Return 401/403
        │ (Passed)
        ▼
[STEP 2: Upstash Redis Blacklist Lookup] ──(In Blacklist)────────► Log & Return 403 SHARE_REVOKED
        │ (Not in Blacklist)
        ▼
[STEP 3: MongoDB Share & Doc State] ───────(Revoked/Expired/Max)─► Log & Return 403
        │ (Active & Valid)
        ▼
[STEP 4: Device Lock Check] ───────────────(Cookie Mismatch)─────► Log & Return 403 DEVICE_MISMATCH
        │ (Match or New Bind)
        ▼
[STEP 5: Forward Detection Telemetry] ────(Diff Network)────────► Log suspicious_multi_device (Non-blocking)
        │
        ▼
[STEP 6: Atomic View Quota Increment] ────(Race Condition)───────► Return 403 SHARE_EXHAUSTED
        │ (Success)
        ▼
[STEP 7: Issue 10-Min Viewer Ticket] ─────► Return Document Metadata & Ticket
```

### Why this EXACT check order?

1. **Step 1: JWT Signature First**:
   - *Why*: Reject junk or forged tokens in CPU memory (sub-microseconds) before making any network calls to Redis or MongoDB.
2. **Step 2: Redis Blacklist Second**:
   - *Why*: Redis is in-memory and handles lookups in <1ms. Agar owner ne link revoke kar diya hai, hume MongoDB ka heavy query karne ki zaroorat hi nahi hai. Reject instantly!
   - *Fail-Closed*: Agar Redis down ho gaya, hum fail-closed karte hain (access deny) taaki revoked links leak na ho sakein.
3. **Step 3: MongoDB Share & Doc Check Third**:
   - *Why*: Check whether document was deleted, whether `expiresAt` time has passed, or whether `viewCount >= maxViews`.
4. **Step 4: Device Lock Check Fourth**:
   - *Why*: Agar `lockToFirstDevice` true hai, read cookie `share_sess`. Agar cookie empty hai to bind session ID. Agar cookie mismatch hai to immediately log `access_denied_different_device` and return 403.
5. **Step 5: Forward Detection Fifth**:
   - *Why*: Agar device lock off bhi hai, hum dekhte hain ki kya previous access different IP/device se tha. Agar tha to owner ke compliance audit log me `suspicious_multi_device` flag ho jata hai.
6. **Step 6: Atomic View Count Sixth**:
   - *Why*: Race condition prevention! Agar 5 users simultaneously link click karein on a 1-view limit file, standard `share.viewCount++` fail ho jayega. Hum use karte hain:
     ```javascript
     SharePermission.findOneAndUpdate(
       { _id: share._id, status: 'active', viewCount: { $lt: share.maxViews } },
       { $inc: { viewCount: 1 } }
     );
     ```
     Only the authorized number of requests can succeed!
7. **Step 7: Issue Viewer Ticket Last**:
   - *Why*: Recipient ko short-lived (10m) `viewerTicket` issue hota hai to stream bytes without burning extra view counts.

---

## 5. Streaming Proxy & Zero Public URL Exposure

### Files involved:
- [`backend/src/services/cloudinaryService.js`](file:///d:/Projects/DocVault/backend/src/services/cloudinaryService.js)
- [`backend/src/controllers/accessController.js`](file:///d:/Projects/DocVault/backend/src/controllers/accessController.js#L320-L390)

### How Streaming Works:
1. Files Cloudinary me `type: "authenticated"` me store hoti hain.
2. Cloudinary ka URL **kabhi bhi client ko nahi bheja jaata**.
3. When client calls `GET /api/access/stream?ticket=<viewerTicket>`:
   - Server verifies the viewer ticket.
   - **Re-checks Redis blacklist on every single byte stream request!** (Agar owner beech me revoke dabaye, viewer 4 second ke andar kill ho jata hai).
   - Server generates a short-lived private signed URL internally, fetches it, and streams the buffer to the client with:
     ```http
     Content-Type: application/pdf
     Content-Disposition: inline
     Cache-Control: no-store, no-cache, must-revalidate
     X-Content-Type-Options: nosniff
     ```
   - Supports `Range: bytes=...` headers so PDF.js can seek partial byte chunks without downloading 50MB files at once.

---

## 6. Audit Log Architecture (State vs Event History)

- **SharePermission** = **State** (Current snapshot: viewCount, expiresAt, status). Updates over time.
- **AccessLog** = **Event History** (Immutable, Append-Only):
  - Every view, download, download block, device mismatch, or revocation is logged as a separate document with IP, userAgent, and parsed device label (e.g. "Windows 10 • Chrome 128").
  - There are intentionally **NO update or delete endpoints** for AccessLog.

---

## 7. Interview Questions This Project Answers 🎯

### Q1: How does DocVault differ from Google Drive or Dropbox?
> **Answer**: Google Drive focuses on convenience and collaboration; links are permanent by default, storage URLs are public/CDN-backed, and access is hard to audit forensically. DocVault focuses on **control and accountability**:
> 1. Auto-expiring time and view quotas.
> 2. Instant Redis-based revocation without changing the URL.
> 3. Zero storage URL exposure (everything proxied).
> 4. Hardware/device locking and dynamic watermarking.

### Q2: Why use a hybrid JWT + Database + Redis architecture instead of pure sessions or pure stateless JWTs?
> **Answer**:
> - Pure stateless JWTs **cannot be revoked instantly** without changing the secret key.
> - Pure database sessions require a disk/network query on every single request, slowing down high-throughput streaming.
> - **DocVault's Hybrid Model**:
>   - Access tokens are short-lived JWTs (15 min) kept in memory.
>   - Long-lived grants use Redis keys `revoked:<jti>` with TTLs matching token expiry.
>   - This gives the speed of JWT verification with sub-millisecond instant revocation capabilities.

### Q3: Why did you choose HS256 instead of RS256 here?
> **Answer**:
> - RS256 (asymmetric public/private key) is ideal when **external third-party microservices** need to verify tokens without knowing the private signing secret.
> - Here, DocVault's backend is the single authority issuing and verifying share tokens. HS256 (symmetric HMAC-SHA256) is faster, simpler to rotate securely via environment variables, and has lower cryptographic overhead.

### Q4: What is Refresh Token Rotation with Reuse Detection, and what attack does it stop?
> **Answer**:
> - It stops **Token Replay and Credential Theft attacks**.
> - Every time a refresh token is used, it is revoked and replaced with a new one in the same rotation `family`.
> - If an attacker steals a token and presents it after the legitimate user has already refreshed, the server detects that an already-revoked token was presented.
> - The server immediately invalidates the entire token family, logging out both the attacker and the victim and forcing re-authentication.

### Q5: How do you prevent race conditions when enforcing `maxViews`?
> **Answer**:
> - In Node.js, doing `const doc = await find(); if (doc.views < 5) { doc.views++; await doc.save(); }` is prone to TOCTOU (Time of Check to Time of Use) race conditions under concurrent requests.
> - We solve this with an atomic MongoDB operation:
>   ```javascript
>   SharePermission.findOneAndUpdate(
>     { _id: shareId, status: 'active', viewCount: { $lt: maxViews } },
>     { $inc: { viewCount: 1 } },
>     { new: true }
>   );
>   ```
> - The database engine guarantees atomicity; only threads that successfully match the condition will increment, and any overflow requests return null and get rejected with 403.
