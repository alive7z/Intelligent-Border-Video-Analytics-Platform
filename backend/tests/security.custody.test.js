"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildCustodyRecord, validateCustodyChain, NULL_HASH } = require("../src/security/custody");

const chainFor = (actions) => {
  let prev = NULL_HASH;
  const records = [];
  for (const action of actions) {
    const rec = buildCustodyRecord(prev, { evidenceId: "EV-C-1", action, timestamp: `2026-01-01T00:00:0${records.length}.000Z` });
    records.push({ evidenceId: rec.evidenceId, action: rec.action, timestamp: rec.timestamp, previousRecordHash: rec.previousRecordHash, recordHash: rec.recordHash });
    prev = rec.recordHash;
  }
  return records;
};

test("NULL_HASH is the sha256 of the empty string", () => {
  assert.equal(NULL_HASH, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("a valid hash chain validates", () => {
  const records = chainFor(["CREATED", "HASHED", "SIGNED", "ANCHORED"]);
  const result = validateCustodyChain(records);
  assert.equal(result.valid, true);
});

test("an empty chain is valid (no records yet)", () => {
  assert.equal(validateCustodyChain([]).valid, true);
});

test("a broken previous-link invalidates the chain", () => {
  const records = chainFor(["CREATED", "HASHED", "SIGNED"]);
  records[2].previousRecordHash = NULL_HASH; // tamper the linkage
  const result = validateCustodyChain(records);
  assert.equal(result.valid, false);
  assert.ok(result.reason);
});

test("a record whose content hash does not match its payload invalidates", () => {
  const records = chainFor(["CREATED", "HASHED", "SIGNED"]);
  records[1].action = "EXPORTED"; // tamper content without updating recordHash
  assert.equal(validateCustodyChain(records).valid, false);
});

test("a duplicate/replayed record invalidates the chain", () => {
  const records = chainFor(["CREATED", "HASHED"]);
  records.push(records[1]);
  assert.equal(validateCustodyChain(records).valid, false);
});