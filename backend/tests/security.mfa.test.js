"use strict";

process.env.EVIDENCE_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const test = require("node:test");
const assert = require("node:assert");
const mfa = require("../src/security/mfa");

test("generateSecret returns a 20-byte base32 secret", () => {
  const secret = mfa.generateSecret();
  assert.equal(secret.length, 32); // 20 bytes → 32 base32 chars
  assert.match(secret, /^[A-Z2-7]+$/);
});

test("verifyCode accepts the current TOTP code", () => {
  const secret = mfa.generateSecret();
  const code = mfa.generateCode(secret);
  assert.equal(mfa.verifyCode(secret, code, 1), true);
});

test("verifyCode rejects a garbage code", () => {
  const secret = mfa.generateSecret();
  assert.equal(mfa.verifyCode(secret, "000000", 1), false);
});

test("generateRecoveryCodes produces 8 distinct one-time codes", () => {
  const codes = mfa.generateRecoveryCodes(8);
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
});

test("hashRecoveryCode is a deterministic sha256 prefixed with 'recovery:'", () => {
  const h1 = mfa.hashRecoveryCode("ABC123");
  const h2 = mfa.hashRecoveryCode("ABC123");
  assert.equal(h1, h2);
  assert.equal(h1, require("crypto").createHash("sha256").update("recovery:ABC123").digest("hex"));
});

test("base32 helpers round-trip", () => {
  const raw = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const enc = mfa.toBase32(raw);
  const dec = mfa.fromBase32(enc);
  assert.deepEqual(dec, raw);
});