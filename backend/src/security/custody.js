"use strict";

const { sha256Hex, custodyCanonicalPayload } = require("./crypto.service");

// Pure append-only chain-of-custody builder. Each record carries the hash of
// the previous record, forming a cryptographic hash chain. The chain is
// validated by replaying records in order — any silent modification of an
// earlier record is detected.

const NULL_HASH = sha256Hex("");

const buildCustodyRecord = (previousHash, entry) => {
  const payload = {
    evidenceId: entry.evidenceId,
    action: entry.action,
    previousRecordHash: previousHash || NULL_HASH,
    timestamp: entry.timestamp || new Date().toISOString(),
  };
  const recordHash = sha256Hex(custodyCanonicalPayload(payload));
  return { ...entry, ...payload, recordHash };
};

// Builds the full chain from authenticated, ordered records (as loaded from
// the database). Re-validates both linkage and per-record content hashes.
const validateCustodyChain = (records) => {
  let previousHash = NULL_HASH;
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    if (rec.previousRecordHash !== previousHash) {
      return { valid: false, brokenAt: i, reason: "previousRecordHash mismatch" };
    }
    const payload = {
      evidenceId: rec.evidenceId,
      action: rec.action,
      previousRecordHash: rec.previousRecordHash,
      timestamp: rec.timestamp,
    };
    if (rec.recordHash !== sha256Hex(custodyCanonicalPayload(payload))) {
      return { valid: false, brokenAt: i, reason: "recordHash does not match content" };
    }
    previousHash = rec.recordHash;
  }
  return { valid: true, lastHash: previousHash };
};

module.exports = { NULL_HASH, buildCustodyRecord, validateCustodyChain };