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

| Mechanism | Derived key | Required at rest? | Rotation |
|-----------|-------------|-------------------|----------|
| Password (Argon2id) / bcrypt | salt + work factor | yes (never plain text) | periodic |
| JWT access (Ed25519-signed) | 15 min TTL | no | on promote |
| JWT refresh (rotating) | 7 d TTL | DB record | on each rotate |
| MFA TOTP (HMAC-SHA1, 30 s) | per-user secret | keychain/DB | on re-enrol |
| MFA recovery codes | BCrypt hash (single-use) | hashed rows | re-issue |
| Ledger node bearer | random 32B | `LEDGER_NODE_TOKEN` env | on compromise |

Environment: `JWT_ACCESS_TTL=900`, `JWT_REFRESH_TTL=604800`, `MFA_ENABLED=true`,
`MFA_ISSUER=IBVAP`, `MFA_APPEAL_MINUTES=5`.

## Authorisation (RBAC)

Roles enforced by middleware (`authorizeRoles`):
`ADMINISTRATOR`, `SECURITY_OPERATOR`, `AUDITOR_ANALYST`, `OPERATOR`, `VIEWER`.
Evidence-integrity endpoints also allow `AUDITOR_ANALYST` read + verify.

## Integrity pipeline

See `docs/blockchain-integrity.md` for the full A1–A12 capture→anchor→verify walk.

- **Digest** — SHA-256 over exact captured bytes (`sha256File`).
- **Signature** — Ed25519 (Rust-free, pure JS) replayable offline.
- **Canonicalisation** — key-order-independent object digest for custody hashing.
- **Chain of custody** — every transition (capture/inspect/export/transfer) appends
  a signed link; each record hashes the prior link + canonical payload.
- **Ledger anchor** — permissioned PoA ledger batch `REGISTER_AUDIT_BATCH` with a
  Merkle root; per-evidence `REGISTER_EVIDENCE`; read-back via ledger RPC.

DB columns: `evidence_integrity.sha256`, `signature`, `signature_public_key`,
`ledger_status`, `ledger_tx_hash`, `ledger_block_number`, `anchored_at`.

## Transport security

- All evidence/asset fetch endpoints are bearer-authenticated; no unauthenticated
  file read (path-traversal guarded).
- `helmet` headers + CORS whitelisting (see `backend/.env.example`): `CORS_ORIGIN`,
  `CSP_*`. Credentials never logged; secrets never serialized into API responses.

## Rate limiting & brute-force defence

- Per-IP limiter on MFA verify, JWT login, and evidence-integrity verification.
- Configurable burst/window (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`).
- Optional `TIMEOUT_MS`, SSL (`HTTP_ENABLED`/`PORT`), and `MODE=production`.

## Audit & events

- Security events (`EVIDENCE_VIEWED`, `MFA_ENROLLED`, custody transitions) are
  recorded and can be fed to the audit-anchor service.
- Ledger health and pending-anchor counts are surfaced through the security
  overview endpoint for the admin dashboard.

## Turn-key hardening checklist (ops)

1. Set a strong `JWT_SECRET`, `EVIDENCE_MASTER_KEY`, `MFA_*` and
   `LEDGER_NODE_TOKEN` (do not reuse the demo token).
2. Set `BLOCKCHAIN_ENABLED=true` and point `LEDGER_RPC_URL` at the permissioned
   PoA node (default demo ports 8541–8543; override with `LEDGER_PORT`).
3. Keep `MODE=production`, `HTTP_ENABLED=false` behind TLS only if deployed.
4. Confirm `EVIDENCE_INTEGRITY_ENABLED=true` and non-empty
   `EVIDENCE_INTEGRITY_MECHANISMS`.
5. Run `node --test tests/security.*.test.js` and the ledger e2e to confirm.
