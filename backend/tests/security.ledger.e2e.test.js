"use strict";

// Full end-to-end proof of the evidence-integrity pipeline against a real,
// locally-spawned permissioned ledger node: capture file → SHA-256 → Ed25519
// signature → custody chain → ledger anchor → verification (VERIFIED) →
// tampered copy (TAMPERED). Self-contained: starts its own ledger on :8591.

process.env.LEDGER_RPC_URL = process.env.LEDGER_RPC_URL || "http://127.0.0.1:8591";
process.env.LEDGER_NODE_TOKEN = process.env.LEDGER_NODE_TOKEN || "testtoken";
process.env.BLOCKCHAIN_ENABLED = "true";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { once } = require("events");
const { getPool, closeDatabasePool } = require("../src/config/database");
const evidenceRepository = require("../src/repositories/evidence.repository");
const integrityRepository = require("../src/repositories/integrity.repository");
const integrityService = require("../src/security/integrity.service");
const ledgerClient = require("../src/ldr/ledgerClient");

const LEDGER_DIR = path.resolve(__dirname, "..", "..", "ledger");
const STORAGE_ROOT = path.resolve(__dirname, "..", "..", "storage");

let ledgerProc = null;

const waitForLedger = async (times = 20) => {
  for (let i = 0; i < times; i += 1) {
    try {
      const h = await ledgerClient.health();
      if (h && h.status === "ok") return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

test.before(async () => {
  ledgerProc = spawn("python3", [
    "ledger.py", "--node-id", "TEST", "--port", "8591",
    "--chain-id", "51201", "--token", "testtoken",
  ], { cwd: LEDGER_DIR, stdio: ["ignore", "inherit", "inherit"] });
  const ready = await waitForLedger();
  assert.ok(ready, "ledger node did not become healthy within 5s");
});

test.after(async () => {
  if (ledgerProc) {
    ledgerProc.kill("SIGKILL");
    try { await once(ledgerProc, "exit"); } catch {}
  }
  await closeDatabasePool();
});

test("capture → hash → sign → custody → ledger anchor → verify pipeline", async () => {
  const evidenceId = crypto.randomUUID();
  const dir = path.join(STORAGE_ROOT, "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const relRef = `storage/snapshots/${evidenceId}-demo.jpg`;
  const abs = path.join(STORAGE_ROOT, "snapshots", `${evidenceId}-demo.jpg`);
  const bytes = Buffer.from(`IBVAP-BLOCKCHAIN-DEMO-${evidenceId}`, "utf8");
  fs.writeFileSync(abs, bytes);

  try {
    const row = await evidenceRepository.create({
      evidenceCode: evidenceId,
      eventId: null, alertId: null, cameraId: null,
      evidenceType: "SNAPSHOT",
      filePath: relRef, mimeType: "image/jpeg", fileSizeBytes: bytes.length,
      checksum: require("../src/security/crypto.service").sha256Hex(bytes),
      capturedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    assert.ok(row.id, "evidence row created");

    const core = await integrityService.onEvidenceIngested({
      rowId: row.id, evidenceId,
      absolutePath: abs, mimeType: "image/jpeg",
      eventId: null, cameraCode: "CAM-01", alertId: null,
      createdAt: new Date().toISOString(), fileSize: bytes.length,
    });
    assert.ok(core.sha256, "integrity core computed with a sha256");
    assert.ok(core.signature, "Ed25519 signature produced");

    // Await the fire-and-forget auto-anchor (deterministic in test).
    let anchored = null;
    for (let i = 0; i < 24; i += 1) {
      const row = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
      if (row && row.ledger_status === "ANCHORED") { anchored = row; break; }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(anchored && anchored.ledger_status === "ANCHORED", "evidence anchored on the ledger");
    assert.ok(anchored.ledger_tx_hash && Number.isInteger(Number(anchored.ledger_block_number)), "ledger tx + block returned");

    const record = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
    assert.equal(record.ledger_status, "ANCHORED");
    assert.equal(record.sha256_hash, core.sha256);

    const custody = await integrityRepository.getCustodyRecords(evidenceId);
    assert.equal(custody.length, 4); // CREATED, HASHED, SIGNED, ANCHORED
    const chainCheck = require("../src/security/custody").validateCustodyChain(custody);
    assert.equal(chainCheck.valid, true);

    // 2) Verify: UNTAMPERED file → must report VERIFIED.
    const verified = await integrityService.verifyEvidence({ evidenceId, absolutePath: abs });
    assert.equal(verified.checks.hash, "HASH_MATCH");
    assert.equal(verified.checks.signature, "SIGNATURE_VALID");
    assert.equal(verified.checks.custody, "CHAIN_OF_CUSTODY_VALID");
    assert.equal(verified.overall, "VERIFIED");

    // 3) Tamper a COPY → must report TAMPERED + hash mismatch.
    const tamperAbs = path.join(STORAGE_ROOT, "snapshots", `${evidenceId}-tampered.jpg`);
    fs.writeFileSync(tamperAbs, Buffer.concat([bytes.subarray(0, bytes.length - 2), Buffer.from("XX")]));
    const tampered = await integrityService.verifyEvidence({ evidenceId, absolutePath: tamperAbs });
    assert.equal(tampered.checks.hash, "HASH_MISMATCH");
    assert.equal(tampered.overall, "TAMPERED");
    fs.rmSync(tamperAbs, { force: true });
  } finally {
    fs.rmSync(abs, { force: true });
  }
});

test("ledger rejects duplicate evidence anchoring", async () => {
  const evidenceId = crypto.randomUUID();
  const dir = path.join(STORAGE_ROOT, "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(STORAGE_ROOT, "snapshots", `${evidenceId}-dup.jpg`);
  const bytes = Buffer.from("dup-bytes");
  fs.writeFileSync(abs, bytes);
  const relRef = `storage/snapshots/${evidenceId}-dup.jpg`;
  try {
    const row = await evidenceRepository.create({
      evidenceCode: evidenceId, eventId: null, alertId: null, cameraId: null,
      evidenceType: "SNAPSHOT", filePath: relRef, mimeType: "image/jpeg",
      fileSizeBytes: bytes.length, capturedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    await integrityService.onEvidenceIngested({
      rowId: row.id, evidenceId, absolutePath: abs, mimeType: "image/jpeg",
      eventId: null, cameraCode: "CAM-01", createdAt: new Date().toISOString(), fileSize: bytes.length,
    });
    // Wait until the auto-anchor commits so the second registration is a true duplicate.
    for (let i = 0; i < 24; i += 1) {
      const r = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
      if (r && r.ledger_status === "ANCHORED") break;
      await new Promise((res) => setTimeout(res, 250));
    }
    const second = await ledgerClient.registerEvidence({
      evidenceId, sha256: require("../src/security/crypto.service").sha256Hex(bytes),
      metadataHash: "x".repeat(64), cameraCode: "CAM-01", keyId: "ev-key-v1",
      chainId: 51201, network: "ibvap-permissioned-poa",
    });
    assert.ok(second.status !== "ANCHORED", "duplicate must not anchor");
    assert.ok((second.error || "").includes("duplicate"), "rejects with a duplicate error");
  } finally {
    fs.rmSync(abs, { force: true });
  }
});