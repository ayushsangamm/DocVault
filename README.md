# DocVault 🛡️ — Controlled & Audited Document Sharing

> **A zero-trust, controlled document-sharing platform for high-sensitivity files** (certificates, legal agreements, medical reports, compliance audits). Built for **control and accountability**, not convenience.

Unlike Google Drive or traditional cloud storage, **DocVault guarantees**:
1. **Auto-Expiring Access**: Time-based (hours/days) and strict atomic view-count quotas.
2. **Instant Revocation Without Breaking URLs**: Revoking a link puts its cryptographic ID in a distributed Redis blacklist, immediately returning `403 Forbidden` within milliseconds.
3. **Granular Permissions & Least Privilege**: View-Only or Allow-Download. View mode blocks direct binary downloads, right-click, text selection, and prints.
4. **Dynamic Forensic Watermarking**: Repeating diagonal watermark containing the recipient's verified email and timestamp over documents.
5. **Forward Protection (Device Locking)**: Cryptographically binds the link to the first browser/device that opens it. Forwarded links fail immediately.
6. **Zero Public Storage Exposure**: Files are stored in Cloudinary in `authenticated` mode. Recipients never see storage URLs or bucket endpoints; all byte streams are verified and proxied server-side.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Clients
        Owner["Document Owner<br/>(React Dashboard)"]
        Recipient["Unauthenticated Recipient<br/>(Web Browser / Mobile)"]
    end

    subgraph DocVault Backend ["DocVault API (Node.js & Express :5000)"]
        AuthMiddleware["authenticate.js<br/>(Bearer Access Token)"]
        AccessRouter["accessRoutes.js<br/>(Rate Limited)"]
        CheckPipeline["7-Step Verification Pipeline"]
        TokenService["tokenService.js<br/>(Rotation & Reuse Detection)"]
        StreamProxy["Streaming & Range Proxy"]
    end

    subgraph Infrastructure
        MongoDB[("MongoDB<br/>(Users, Docs, Shares, Immutable Logs)")]
        Redis[("Upstash Redis<br/>(Sub-ms Revocation Blacklist)")]
        Cloudinary[("Cloudinary Authenticated Storage<br/>(Non-Public Buckets)")]
    end

    Owner -->|Uploads Document| DocVault Backend
    DocVault Backend -->|Authenticated Upload| Cloudinary
    Owner -->|Mints Ephemeral Link| DocVault Backend
    DocVault Backend -->|Generates Signed JWT| Owner

    Recipient -->|Opens /s/:token| AccessRouter
    AccessRouter --> CheckPipeline
    CheckPipeline -->|1. Check Blacklist| Redis
    CheckPipeline -->|2. Verify Expiry & Device Lock| MongoDB
    CheckPipeline -->|3. Atomic Incr View| MongoDB
    CheckPipeline -->|4. Log Viewed/Denied| MongoDB
    CheckPipeline -->|5. Issue Viewer Ticket| Recipient

    Recipient -->|GET /stream?ticket=...| StreamProxy
    StreamProxy -->|Fetch Signed URL & Pipe| Cloudinary
    StreamProxy -->|Stream Bytes to Canvas/PDF.js| Recipient
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** >= v18.0 (v20+ recommended)
- **MongoDB** (Local `mongodb://localhost:27017/docvault` or MongoDB Atlas)
- **Upstash Redis** (Free serverless Redis instance)
- **Cloudinary Account** (Free cloud storage)

### 1. Repository Setup

```bash
git clone https://github.com/your-username/docvault.git
cd docvault
```

### 2. Backend Configuration & Startup

```bash
cd backend
cp .env.example .env
```

Populate `backend/.env` with your credentials:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/docvault
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
JWT_ACCESS_SECRET=your_generated_access_secret
JWT_REFRESH_SECRET=your_generated_refresh_secret
SHARE_TOKEN_SECRET=your_generated_share_secret
```

> **Tip:** You can generate high-entropy 64-byte cryptographic secrets by running:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

Install dependencies and start backend:

```bash
npm install
npm run seed     # (Optional) Seed realistic demo records & user: demo@docvault.io / Password123!
npm run dev      # Starts on http://localhost:5000
```

Run test suite:

```bash
npm test         # Executes Vitest suite for auth, rotation, reuse detection, and access checks
```

### 3. Frontend Configuration & Startup

```bash
cd ../frontend
cp .env.example .env
```

Configure `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Install dependencies and run frontend:

```bash
npm install
npm run dev      # Starts on http://localhost:5173
```

Navigate to `http://localhost:5173/login` in your browser.

---

## 📡 API Route Reference

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | System health check and uptime status |
| `POST` | `/api/auth/signup` | No (Rate Limited) | Register new document owner with bcrypt (cost 12) |
| `POST` | `/api/auth/login` | No (Rate Limited) | Authenticate owner; returns short-lived access token + httpOnly refresh cookie |
| `POST` | `/api/auth/refresh` | No (Cookie) | Rotates refresh token with cryptographic reuse detection |
| `POST` | `/api/auth/logout` | No | Revokes refresh token and clears session cookie |
| `GET` | `/api/auth/me` | Bearer Token | Fetches authenticated owner profile |
| `POST` | `/api/documents` | Bearer Token | Multipart upload (10 MB limit, MIME + magic byte validation) |
| `GET` | `/api/documents` | Bearer Token | List owned documents with active share counts |
| `GET` | `/api/documents/:id` | Bearer Token | Fetch document detail, share grants, and recent logs |
| `PATCH` | `/api/documents/:id` | Bearer Token | Rename document title |
| `DELETE` | `/api/documents/:id` | Bearer Token | Delete Cloudinary asset and cascade-blacklist all active shares |
| `POST` | `/api/shares` | Bearer Token | Mint a signed, revocable share link (`${CLIENT_URL}/s/<token>`) |
| `GET` | `/api/shares` | Bearer Token | Filterable "Shared by me" list with computed statuses |
| `GET` | `/api/shares/:id` | Bearer Token | Share detail and complete audit timeline |
| `POST` | `/api/shares/:id/revoke` | Bearer Token | Instant kill switch; blacklists token in Redis with remaining TTL |
| `POST` | `/api/shares/:id/reset-lock` | Bearer Token | Clears device lock session binding |
| `POST` | `/api/shares/:id/regenerate-link` | Bearer Token | Blacklists old token and issues fresh grant with identical policy |
| `POST` | `/api/access/open` | Public (Rate Limited) | Strictly ordered 7-step zero-trust verification pipeline |
| `GET` | `/api/access/stream` | Public (Ticket) | Streams document bytes with Range request support (no URL leaks) |
| `POST` | `/api/access/download` | Public (Rate Limited) | Downloads binary payload; rejected with 403 if permission is `view` |
| `POST` | `/api/access/verify-status` | Public | Real-time polling heartbeat to detect instant revocation |
| `GET` | `/api/audit` | Bearer Token | Immutable, paginated compliance event logs |
| `GET` | `/api/analytics/summary` | Bearer Token | Real database-computed security telemetry and 14-day view charts |

---

## 🛡️ Security Decisions & Principles

1. **Tokens in Memory Only**: The frontend never stores access tokens in `localStorage` or `sessionStorage`. This prevents token extraction via Cross-Site Scripting (XSS).
2. **Refresh Token Rotation & Reuse Detection**: Refresh tokens are stored hashed (SHA-256) at rest. Upon every refresh, the token is consumed and rotated. If a previously consumed token is replayed, the entire session family is automatically revoked.
3. **Fail-Closed Redis Verification**: If Upstash Redis experiences a transient network outage during an access check, DocVault **fails closed** (denies access). It will never allow a potentially revoked link to open because of cache failure.
4. **Separate Signing Secrets**: Access tokens and share tokens are signed with completely distinct secrets (`JWT_ACCESS_SECRET` vs `SHARE_TOKEN_SECRET`). A compromise in one domain does not impact the other.
5. **Constant-Time Login Timing Protection**: If a non-existent email is entered during login, `bcrypt.compare` is still run against a dummy hash to prevent timing-based user enumeration.
6. **Strict 404 for Foreign Resources**: Attempting to query an ID belonging to another user returns `404 Not Found` (never `403 Forbidden`) to eliminate ID harvesting.

---

## 🌐 Deployment Notes

- **Database**: In production, replace `MONGODB_URI` with a MongoDB Atlas replica set URI.
- **Backend (Render / Railway / Fly.io)**: Ensure `NODE_ENV=production` is set so cookie `secure: true` is activated.
- **Frontend (Vercel / Netlify)**: Set `VITE_API_BASE_URL` to your production backend URL.
- **Cross-Domain Cookies**: If frontend and backend are deployed across different domains (e.g. `docvault.vercel.app` and `api.docvault.com`), set `CROSS_SITE=true` in `backend/.env` to configure `sameSite: 'none'` with `secure: true`.

---

## ⚠️ Honest Limitations

- **Screenshots Cannot Be Fully Prevented**: Operating system screen captures (PrintScreen, OS snipping tools) cannot be intercepted by browser JavaScript. DocVault deters leakage via prominent diagonal watermarks containing the recipient's identity and timestamp.
- **Device Lock Cookie Mechanics**: Device locking relies on an `httpOnly` cookie (`share_sess`). A determined technical user with browser debugging tools could clone their cookies to a second device.
- **Browser Cache Clearing**: If a legitimate recipient clears their browser cookies or switches browsers, they will be locked out until the owner clicks "Reset Device Lock" in the dashboard.
