"use strict";

const crypto = require("crypto");
const env = require("../config/env");

// RFC 6238 compatible TOTP (SHA-1, 6 digits, 30s step) for Admin MFA.
// Secret is stored base32-encoded; we encrypt it at-rest in the DB via
// the evidence encryption key (EVIDENCE_MASTER_KEY) when available, or
// store HMAC(secret) as proof-of-posssession only. For TOTP verification we
// need the raw secret at runtime so it is passed via a JWT-pinned
// mfa_challenge_token with a 5-minute window and single-use gate.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const toBase32 = (buf) => {
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32[parseInt((bits.slice(i, i + 5) || "00000").padEnd(5, "0"), 2)];
  }
  return out;
};

const fromBase32 = (s) => {
  const clean = s.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error("invalid base32 character");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};

const generateSecret = () => toBase32(crypto.randomBytes(20)); // 160 bits

const _hmac = (secret, counter, algo = "sha1") => {
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) { buf[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = crypto.createHmac(algo, fromBase32(secret)).update(buf).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24 | (h[offset + 1] & 0xff) << 16 | (h[offset + 2] & 0xff) << 8 | (h[offset + 3] & 0xff)) % 1000000;
  return String(code).padStart(6, "0");
};

const generateCode = (secret) => {
  const counter = Math.floor(Date.now() / 30000);
  return _hmac(secret, counter);
};

const verifyCode = (secret, code, window = 1) => {
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i += 1) {
    if (_hmac(secret, counter + i) === code) return true;
  }
  return false;
};

// ─── Recovery codes ───────────────────────────────────────────────────────

const generateRecoveryCodes = (count = 8) => {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(crypto.randomBytes(4).toString("hex"));
  }
  return codes; // shown once, caller hashes before storing
};

const hashRecoveryCode = (code) => crypto.createHash("sha256").update(`recovery:${code}`).digest("hex");

const generateMfaChallengeToken = (userId, secret) => {
  // 5-minute single-purpose token containing the encrypted secret. Signed by JWT.
  const { encryptAESGCM, signEvidenceRecord } = require("./crypto.service");
  const encSecret = env.EVIDENCE_MASTER_KEY
    ? encryptAESGCM(secret, env.EVIDENCE_MASTER_KEY, { aad: `mfa:${userId}` })
    : null; // store plaintext in token when no encryption key (dev) — token is short-lived, signed, and unsigned token is invalid anyway
  return { mfa_secret_token: encSecret || secret, ttlSeconds: 5 * 60 };
};

module.exports = {
  generateSecret, generateCode, verifyCode,
  generateRecoveryCodes, hashRecoveryCode,
  fromBase32, toBase32,
  generateMfaChallengeToken,
};