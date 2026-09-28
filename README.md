# DocVault 🔐

> A secure, controlled document-sharing platform engineered for sensitive files with revocable access, view limits, anti-forwarding device locks, and an immutable audit ledger.

---

## 📌 What is DocVault?

Unlike conventional cloud drives that prioritize frictionless sharing, **DocVault** is built for strict control and accountability. It allows document owners to share confidential records (such as legal files, certificates, and reports) under precise, enforceable constraints.

Recipients access documents via tamper-proof signed links without exposing direct storage endpoints.

---

## ✨ Key Capabilities

- **Auto-Expiring Links:** Time-based access windows (1 hour to 7 days) and strict maximum view counts.
- **Instant Revocation:** Invalidate access immediately via in-memory caching without reissuing the share link.
- **Zero-Storage URL Leakage:** Files are streamed through a server-side backend proxy; raw Cloudinary storage URLs are never exposed to the client.
- **Recipient Deterrents:** Dynamic diagonal watermarking (displaying recipient email and timestamp) and disabled save/print shortcuts.
- **Device-Lock (Anti-Forwarding):** Binds access to the first authorized device via secure HTTP-only cookies, blocking forwarded link abuse.
- **Immutable Security Ledger:** Append-only access logs tracking views, downloads, device signatures, and unauthorized attempts.
- **Mandatory Account Match:** Strict identity verification requiring recipients to log in with the exact recipient email before viewing.

---

## 🛠️ Tech Stack

- **Frontend:** React (Vite), Tailwind CSS, Lucide Icons, Axios
- **Backend:** Node.js, Express (ES Modules)
- **Database:** MongoDB (Mongoose)
- **Cache & Revocation:** Upstash Redis
- **File Storage:** Cloudinary (Authenticated Uploads & Private Delivery)
- **Security & Auth:** JWT, Bcrypt.js (Cost factor 12), HTTP-only Cookies, Helmet, Rate Limiting
- **Email Service:** Resend API (Transactional OTP verification)

---

## 🏗️ Architecture & Security Model

```
                    ┌─────────────────────────┐
                    │ Document Owner (Portal) │
                    └────────────┬────────────┘
                                 │
                   (Upload / Mint Signed Grants)
                                 ▼
      ┌─────────────────────────────────────────────────────┐
      │               DocVault API Backend                  │
      │  ┌─────────────────┐       ┌─────────────────────┐  │
      │  │ Auth & OTP Flow │       │  Access Controller  │  │
      │  └─────────────────┘       └──────────┬──────────┘  │
      └───────────────────────────────────────┼─────────────┘
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              ▼                               ▼                               ▼
   ┌────────────────────┐           ┌────────────────────┐          ┌───────────────────┐
   │   Upstash Redis    │           │      MongoDB       │          │    Cloudinary     │
   │ Sub-ms Revocation  │           │ Documents, Shares, │          │  Private Storage  │
   │     Blacklist      │           │ Immutable Ledger   │          │ (Streamed Proxy)  │
   └────────────────────┘           └────────────────────┘          └───────────────────┘
```

1. **Tokens Kept in Memory:** Access tokens live exclusively in client memory, preventing XSS-based storage theft.
2. **Refresh Rotation & Reuse Detection:** Rotates refresh tokens on use; replay attempts revoke the entire token family.
3. **Fail-Closed Revocation:** Blacklist checks fail closed during network partitions to prevent unauthorized access.
4. **Isolated Cryptographic Keys:** Public share tokens use distinct signing secrets from internal user credentials.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.0
- **MongoDB** (Local instance or MongoDB Atlas)
- **Upstash Redis** (Serverless Redis REST endpoint)
- **Cloudinary** (Account with API credentials)
- **Resend** (Optional for production email delivery; dev fallback prints OTP to console)

### 1. Clone Repository

```bash
git clone https://github.com/ayushsangamm/DocVault.git
cd DocVault
```

### 2. Backend Configuration

```bash
cd backend
cp .env.example .env
```

Configure `backend/.env`:

```env
PORT=5000
CLIENT_URL=http://localhost:5173
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/docvault

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-upstash-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token

# Cryptographic Secrets (64-byte hex)
JWT_ACCESS_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
SHARE_TOKEN_SECRET=your_share_token_secret

# Resend Email (Optional for testing)
RESEND_API_KEY=re_your_resend_api_key
```

Install dependencies and start backend:

```bash
npm install
npm run seed      # (Optional) Seed demo documents & shares
npm run dev       # Starts backend on http://localhost:5000
```

### 3. Frontend Configuration

```bash
cd ../frontend
cp .env.example .env
```

Configure `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Install dependencies and start frontend:

```bash
npm install
npm run dev       # Starts frontend on http://localhost:5173
```

---

## 🧪 Testing & Verification

Run the automated backend test suite:

```bash
cd backend
npm test
```

The test suite covers:
- User signup with hashed OTP verification.
- Direct login with timing-attack prevention.
- Refresh token rotation & replay family revocation.
- 7-step zero-trust recipient verification pipeline.
- Instant Redis blacklist kill-switch enforcement.
- Device-lock (anti-forwarding) validation.
- Mandatory recipient identity checks (`AUTH_REQUIRED` and `EMAIL_MISMATCH`).

---

## 📂 Project Structure

```
DocVault/
├── backend/
│   ├── src/
│   │   ├── config/         # DB, Redis, Cloudinary & Env configuration
│   │   ├── controllers/    # Auth, Documents, Shares, Access & Audit controllers
│   │   ├── middleware/     # Auth, Rate limiting, Upload, Error & Validation
│   │   ├── models/         # User, Document, SharePermission, AccessLog schemas
│   │   ├── routes/         # Express API routers
│   │   ├── services/       # Token, Cloudinary, Audit & Blacklist services
│   │   └── utils/          # API error & client telemetry helpers
│   └── tests/              # Vitest automated test suites
├── frontend/
│   ├── src/
│   │   ├── components/     # Modals, Drawers, Navigation & Toasts
│   │   ├── lib/            # Axios API client with interceptors
│   │   ├── pages/          # Dashboard, Document Detail, Shares, Audit & Viewer
│   │   └── store/          # Zustand authentication store
│   └── package.json
└── README.md
```

---

## 📄 License

This project is licensed under the MIT License.
