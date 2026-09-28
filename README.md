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

