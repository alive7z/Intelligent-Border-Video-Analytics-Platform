"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { resolveStorageReference } = require("../src/services/evidence.service");

// B16 — path traversal / confinement regression for the storage reference
// resolver that backs both file streaming and the integrity hashing hook.

test("rejects backslashes", () => {
  assert.throws(() => resolveStorageReference("storage\\..%2Fetc\\passwd"));
});

test("rejects null bytes", () => {
  assert.throws(() => resolveStorageReference("storage/snapshots/a\0.jpg"));
});

test("rejects traversal segments", () => {
  assert.throws(() => resolveStorageReference("storage/../../../../etc/passwd"));
});

test("rejects absolute paths", () => {
  assert.throws(() => resolveStorageReference("/etc/passwd"));
});

test("rejects URL schemes", () => {
  assert.throws(() => resolveStorageReference("https://evil.example/x"));
});

test("rejects references outside the storage root", () => {
  assert.throws(() => resolveStorageReference("storage/../secrets.env"));
});

test("accepts a normal confined reference (returns an absolute path under storage)", () => {
  const abs = resolveStorageReference("storage/snapshots/demo.jpg");
  assert.ok(abs.includes("storage"));
  assert.ok(abs.startsWith("/"));
  assert.ok(!abs.includes(".."));
});