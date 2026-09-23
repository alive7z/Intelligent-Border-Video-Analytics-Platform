"use strict";

const test = require("node:test");
const assert = require("node:assert");
const sessionStore = require("../src/security/session");

test("revokeJti then isRevoked returns true", () => {
  sessionStore._reset();
  sessionStore.revokeJti("jti-1", { userId: 1, reason: "logout" });
  assert.equal(sessionStore.isRevoked("jti-1"), true);
});

test("unrevoked jti returns false", () => {
  sessionStore._reset();
  assert.equal(sessionStore.isRevoked("never-revoked-jti"), false);
});

test("_reset clears the revocation set", () => {
  sessionStore.revokeJti("jti-2");
  sessionStore._reset();
  assert.equal(sessionStore.isRevoked("jti-2"), false);
  assert.equal(sessionStore._size(), 0);
});

test("revoking without a jti is a no-op", () => {
  sessionStore._reset();
  assert.equal(sessionStore.revokeJti(undefined), false);
});

test("revocation tracks the user and reason", () => {
  sessionStore._reset();
  sessionStore.revokeJti("jti-3", { userId: 9, reason: "admin_revoke" });
  assert.equal(sessionStore.isRevoked("jti-3"), true);
});