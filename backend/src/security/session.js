"use strict";

const crypto = require("crypto");

// Session/token revocation store. Additive defense for the stateless-JWT auth:
// new access tokens carry a jti; a SQLite-free in-memory revoke set plus a DB
// `token_revocations` table (via repository) enforce revocation at the
// middleware layer. `token_version` bumps invalidate every token of a user.

const revoked = new Map(); // jti -> {userId, revokedAt, reason}

function revokeJti(jti, { userId, reason } = {}) {
  if (!jti) return false;
  revoked.set(jti, { userId, revokedAt: Date.now(), reason });
  // prune old entries past 48h TTL (tokens expire ≤8h anyway)
  for (const [k, v] of revoked) {
    if (Date.now() - v.revokedAt > 48 * 3600 * 1000) revoked.delete(k);
  }
  return true;
}

function isRevoked(jti) {
  return jti != null && revoked.has(jti);
}

function newJti() {
  return crypto.randomUUID(); // pre-alloc
}

module.exports = { revokeJti, isRevoked, newJti, _reset: () => revoked.clear(), _size: () => revoked.size };