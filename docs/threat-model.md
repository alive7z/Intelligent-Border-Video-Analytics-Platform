# Threat Model — IBVAP

Covers A1–A12 (evidence integrity) plus the hardened auth (JWT/HS256, MFA/TOTP,
Ed25519 evidence signatures, custody, ledger). STRIDE-style; each row is a threat
→ defence → verification.

## Assets

- `A_Evidence` — captured files + `sha256` + signature.
- `A_Custody` — chain of-custody records.
- `A_Ledger` — permissioned PoA ledger (3 demo nodes).
- `A_Auth` — access tokens, MFA secrets, recovery codes.
- `A_Admin` — role-gated security surfaces (admin overview, audit anchors).

## Threats & controls

| # | Threat | STRIDE | Control | Verified by |
|---|--------|--------|---------|-------------|
| T1 | Evidence bytes altered on disk | T | SHA-256 over exact bytes (`sha256File`) | `verifyEvidence` TAMPERED |
| T2 | Evidence metadata forged | T | canonicalize + Ed25519 signature | signature replay |
| T3 | Chain-of-custody record rewritten | T | cumulative hash chain | `validateCustodyChain` |
| T4 | Ledger anchor faked offline | S | on-chain read-back via `getEvidenceRecord` | `VERIFIED` requires ledger match |
| T5 | Node token leaked (ledger) | S | env-only `LEDGER_NODE_TOKEN`, no logs | config review |
| T6 | Forged JWT | S | HS256 pinning + short TTL + `jti`/`token_version` revocation | JWT suite |
| T7 | Stolen credentials w/o 2FA | S | MFA TOTP required for admin accounts when configured | MFA suite |
| T8 | Recovery-code replay | I | single-use SHA-256-hashed codes | MFA suite |
| T9 | Path traversal in evidence read | I/T | canonicalized file-server, traversal guard | pathTraversal suite |
| T10 | Brute force login/MFA | E (DoS) | rate limiting on login/MFA/verify + account lockout | rateLimit config |
| T11 | Audit trail tampering | T | Merkle-root anchored audit batches | `security.merkle` suite |
| T12 | Replay of ledger tx | S | permissioned PoA only accepts node-token proposers; 409 duplicates | ledger e2e |

## Boundary notes

- Browser never touches signing keys or file bytes; all through bearer API.
- DoS: public ledger (non-PoA) requires a real PoW permissioning change — demo
  is intentionally permissioned.
- Residual: `MODERATE` — the demo ledger runs plain HTTP on loopback (8541–8543);
  production deployments must terminate TLS at the edge. Optional mTLS
  (`MTLS_ENABLED`) and HSTS (`ENABLE_HSTS` + production) are supported but not
  defaults. Ledger single-token model acceptable for the 3-node demo.