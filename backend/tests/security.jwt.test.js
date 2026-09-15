"use strict";

process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const jwtUtil = require("../src/utils/jwt");

test("tokens carry jti, iss, aud and HS256", () => {
  const token = jwtUtil.generateAccessToken({ sub: "u1", userId: 1, role: "ADMINISTRATOR" });
  const decoded = jwtUtil.verifyAccessToken(token);
  assert.ok(decoded.jti);
  assert.equal(decoded.iss, "ibvap-backend");
  assert.equal(decoded.aud, "ibvap-frontend");
});

test("verifyAccessToken rejects an unsigned (alg none) token", () => {
  const forged = jwt.sign({ sub: "u1", userId: 1, role: "ADMINISTRATOR" }, null, { algorithm: "none" });
  assert.throws(() => jwtUtil.verifyAccessToken(forged));
});

test("verifyAccessToken rejects a token signed with a different secret", () => {
  const wrong = jwt.sign({ sub: "u1", userId: 1, role: "ADMINISTRATOR" }, "a-different-secret", { algorithm: "HS256" });
  assert.throws(() => jwtUtil.verifyAccessToken(wrong));
});

test("requireIssuerAudience validates issuer/audience when present", () => {
  const token = jwtUtil.generateAccessToken({ sub: "u2" });
  assert.doesNotThrow(() => jwtUtil.verifyAccessToken(token, { requireIssuerAudience: true }));
});

test("token_version is included when requested", () => {
  const token = jwtUtil.generateAccessToken({ sub: "u3" }, { tokenVersion: 7 });
  assert.equal(jwtUtil.verifyAccessToken(token).tkver, 7);
});

test("mfa challenge tokens expose a purpose claim", () => {
  const token = jwtUtil.generateAccessToken({ sub: "u4", purpose: "mfa_challenge", mfaSecret: "abc" }, { expiresIn: "5m" });
  const decoded = jwtUtil.verifyAccessToken(token);
  assert.equal(decoded.purpose, "mfa_challenge");
});