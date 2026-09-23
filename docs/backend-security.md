# Backend Security Hardening — IBVAP

This document is the authoritative reference for the security controls implemented
across the IBVAP backend (`backend/`). It complements `backend/.env.example`
(same key names) and is cross-referenced by the on/off-chain matrix
(`docs/onchain-offchain-matrix.md`) and the threat model (`docs/threat-model.md`).

## General principles

- **Defence in depth** — every sensitive path requires two or more independent
  controls (auth + authorisation + rate limiting + cryptographic integrity).
- **Least privilege** — evidence, custody, MFA, and ledger operations are gated
  by fine-grained roles; the demo ledger node token is never a superuser.
- **Tamper evidence** — evidence is captured → hashed → signed → chained →
  ledger-anchored → verifyable in a single pipeline (see `docs/blockchain-integrity.md`).
- **Config over code** — toggles and secret locations live in `.env` so ops can
  harden without a redeploy.

## Authentication

| Mechanism | Implementation | Required at rest? | Notes |
|-----------|----------------|-------------------|-------|
| Password | bcrypt (`bcryptjs`, 12 rounds) | yes (never plain text) | min 12 chars enforced on create |
| JWT access | HS256-signed, issuer/audience-bound, unique `jti`, `token_version` claim | no | default TTL `JWT_EXPIRES_IN=8h` |
| MFA TOTP | RFC 6238 (HMAC-SHA1, 6 digits, 30 s step) | secret AES-256-GCM encrypted | window `MFA_WINDOW` (default 1) |
| MFA recovery codes | 8 single-use, SHA-256 hashed before storage | yes (hashed rows) | shown once at enrollment |
| Ledger node bearer | shared `LEDGER_NODE_TOKEN` | `LEDGER_NODE_TOKEN` env | timing-safe compare |

There is **no refresh-token flow**. The system issues a single short-lived
HS256 access token; session/token revocation is handled server-side via the
in-memory JTI store, the `token_revocations` table, and `token_version` bumps.

Environment: `JWT_SECRET`, `JWT_EXPIRES_IN=8h`, `MFA_ADMIN_REQUIRED`,
`MFA_ISSUER=IBVAP`, `MFA_WINDOW=1`, `LOGIN_LOCKOUT_THRESHOLD=5`,
`LOGIN_LOCKOUT_MINUTES=15`.

## Authorisation (RBAC)

Roles enforced server-side by middleware `authorizeRoles`
(`backend/src/middleware/role.middleware.js`):
`ADMINISTRATOR`, `SECURITY_OPERATOR`, `AUDITOR_ANALYST`.
Evidence-integrity endpoints allow `AUDITOR_ANALYST` read + verify. Frontend
route guards are UI-only; real access control is enforced on the backend.

## Integrity pipeline

See `docs/blockchain-integrity.md` for the full A1–A12 capture→anchor→verify walk.

- **Digest** — SHA-256 over exact captured bytes (`sha256File`).
- **Signature** — Ed25519 (Node `crypto`) replayable offline.
- **Canonicalisation** — key-order-independent object digest for custody hashing.
- **Chain of custody** — append-only cryptographic hash chain
  (`previousRecordHash` / `recordHash` links) with events CREATED → HASHED →
  SIGNED → ANCHORED.
- **Ledger anchor** — permissioned PoA ledger batch `REGISTER_AUDIT_BATCH` with a
  Merkle root; per-evidence `REGISTER_EVIDENCE`; read-back via ledger RPC.

DB columns: `evidence_integrity.sha256_hash`, `signature`,
`signature_algorithm`, `signing_key_id`, `public_key_pem`, `ledger_status`,
`ledger_tx_hash`, `ledger_block_number`, `anchored_at`.

## Transport security

- All evidence/asset fetch endpoints are bearer-authenticated; no unauthenticated
  file read (path-traversal guarded).
- `helmet` + custom security headers: Content-Security-Policy,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `X-Frame-Options`, and production-only
  Strict-Transport-Security (`ENABLE_HSTS=true` + `NODE_ENV=production`).
- CORS whitelisting (`FRONTEND_URL` + loopback dev origins + optional
  `CORS_ALLOWED_ORIGINS`); disallowed origins get HTTP 403.
- Optional mutual TLS for trusted edge-node communication (`MTLS_ENABLED=true`
  + `MTLS_CA_CERT`); validates client certificates before other middleware.
- HTTP(S) is chosen by the RPC client URL scheme (`https:` for production,
  plain `http://` for the demo ledger on loopback).

## Rate limiting & brute-force defence

- Login: 10 requests / 15 min in production (50 / 5 min in development).
- MFA verification: 8 attempts / 5 min.
- Evidence-integrity verification: 20 / 1 min.
- Account lockout after `LOGIN_LOCKOUT_THRESHOLD` (default 5) failed attempts
  for `LOGIN_LOCKOUT_MINUTES` (default 15); cleared on successful login/MFA.
  Blocked accounts receive HTTP 429.

## Audit & events

- Security events (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `MFA_SUCCESS`, `MFA_FAILED`,
  `MFA_ENABLED`, `SESSION_REVOKED`, `EVIDENCE_HASHED`, `EVIDENCE_SIGNED`,
  `EVIDENCE_VERIFIED`, `EVIDENCE_TAMPERED`, `BLOCKCHAIN_ANCHOR`,
  `BLOCKCHAIN_ANCHOR_FAILED`, `BRUTE_FORCE_LOCKOUT`, `KEY_ROTATION`, …) are
  persisted to `audit_logs` and appended as newline-delimited JSON to
  `storage/security-events.ndjson` for SIEM ingestion.
- Ledger health and pending-anchor counts are surfaced through the
  `GET /api/security/overview` endpoint (admin only).
- Security counters are exposed as Prometheus text at
  `GET /api/security/metrics` (`failed_logins_total`, `mfa_failures_total`,
  `evidence_tamper_detected_total`, `blockchain_anchor_failures_total`, …).

## Turn-key hardening checklist (ops)

1. Set strong `JWT_SECRET`, `EVIDENCE_MASTER_KEY`, `EVIDENCE_SIGNING_PRIVATE_KEY`
   and `LEDGER_NODE_TOKEN` (do not reuse the demo token).
2. Set `BLOCKCHAIN_ENABLED=true` and point `LEDGER_RPC_URL` at the permissioned
   PoA node (default demo ports 8541–8543).
3. Keep `NODE_ENV=production`; terminate TLS at the deployment edge;
   optionally enable `MTLS_ENABLED` and `ENABLE_HSTS`.
4. Confirm `EVIDENCE_INTEGRITY_ENABLED=true` and `BLOCKCHAIN_ENABLED=true` where
   ledger anchoring is required.
5. Run `npm test` (backend) — the security suites cover authentication, MFA,
   JWT, crypto, custody, Merkle batching, path traversal, ledger anchoring,
   and API authorization.