"use strict";

const fs = require("fs");
const env = require("../config/env");
const {
  sha256File, sha256Hex, signEvidenceRecord, verifyEvidenceSignature,
  encryptAESGCM, decryptAESGCM,
} = require("./crypto.service");
const { buildCustodyRecord, validateCustodyChain, NULL_HASH } = require("./custody");
const integrityRepository = require("../repositories/integrity.repository");
const ledgerClient = require("../ldr/ledgerClient");
const securityEvents = require("./securityEvents.service");
const metrics = require("./metrics");

const OVERALL = { VERIFIED: "VERIFIED", TAMPERED: "TAMPERED", PARTIALLY_VERIFIED: "PARTIALLY_VERIFIED", NOT_ANCHORED: "NOT_ANCHORED", ERROR: "ERROR" };

const parseProvenance = (value) => {
  if (typeof value === "string") { try { return JSON.parse(value || "{}"); } catch { return {}; } }
  return value || {};
};

// ─── A1/A2/A3 — hash + integrity record + signature (computed over the exact
// stored file bytes) ────────────────────────────────────────────────────────

async function computeIntegrityCore({ evidenceId, absolutePath, mimeType, eventId, cameraCode, createdAt, fileSize, sha256 }) {
  const currentSha256 = sha256 || (await sha256File(absolutePath));
  const stat = fileSize != null ? Number(fileSize) : fs.statSync(absolutePath).size;
  const signedCreatedAt = createdAt || new Date().toISOString();
  const record = { evidenceId, sha256: currentSha256, eventId, cameraCode, createdAt: signedCreatedAt, keyId: env.EVIDENCE_SIGNING_KEY_ID || "ev-key-v1" };
  const signed = signEvidenceRecord(record);
  return { sha256: currentSha256, fileSize: stat, mimeType, signature: signed.signature, signatureAlgorithm: "Ed25519", signingKeyId: signed.keyId, publicKeyPem: signed.publicKey, record, signedCreatedAt };
}

// Full pipeline used at evidence ingestion (fire-safe: failures never abort
// the alert/evidence write).
async function onEvidenceIngested({ rowId, evidenceId, absolutePath, mimeType, eventId, cameraCode, alertId, createdAt, fileSize }) {
  try {
    const core = await computeIntegrityCore({ evidenceId, absolutePath, mimeType, eventId, cameraCode, createdAt, fileSize });
    const now = new Date();
    await integrityRepository.insertIntegrity({
      evidenceId: rowId, ...core,
      provenance: {
        cameraCode, eventId, alertId,
        capturedAt: createdAt || null,
        signedCreatedAt: core.signedCreatedAt,
        creatingService: "IBVAP-BACKEND",
        hashingAlgorithm: "SHA-256",
        signingAlgorithm: "Ed25519",
      },
    });
    // Chain: CREATED → HASHED → SIGNED
    let prev = NULL_HASH;
    for (const action of ["CREATED", "HASHED", "SIGNED"]) {
      const rec = buildCustodyRecord(prev, { evidenceId: rowId, action, timestamp: now.toISOString() });
      await integrityRepository.insertCustody({
        rowId, action, actorUserId: null, actorRole: "SYSTEM",
        timestamp: now.toISOString(), previousRecordHash: rec.previousRecordHash, recordHash: rec.recordHash,
      });
      prev = rec.recordHash;
    }
    await securityEvents.recordSecurityEvent({ action: "EVIDENCE_HASHED", details: { evidenceId, sha256: core.sha256 } });
    void anchorEvidence(evidenceId); // async, never blocks
    return core;
  } catch (err) {
    return { error: err.message };
  }
}

// ─── A5/A6/A7 — ledger anchor with PENDING_ANCHOR retry (D) ───────────────

async function anchorEvidence(evidenceId) {
  try {
    const integrity = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
    if (!integrity || integrity.ledger_status === "ANCHORED") return;
    const provenance = parseProvenance(integrity.provenance_json);
    const payload = {
      evidenceId,
      sha256: integrity.sha256_hash,
      metadataHash: sha256Hex(canonicalMetadataHash(integrity)),
      cameraCode: provenance.cameraCode,
      eventId: provenance.eventId,
      createdAt: integrity.created_at ? new Date(integrity.created_at).toISOString() : null,
      keyId: integrity.signing_key_id,
      chainId: env.LEDGER_CHAIN_ID || 51201,
    };
    const result = await ledgerClient.registerEvidence(payload);
    const duplicated = result.status !== "ANCHORED" && /duplicate/i.test(result.error || "");
    if (result.status === "ANCHORED" || duplicated) {
      let anchor = result;
      if (duplicated) {
        const rec = await ledgerClient.getEvidenceRecord(evidenceId);
        if (rec && rec.txHash) {
          anchor = { status: "ANCHORED", txHash: rec.txHash, blockNumber: rec.blockNumber, blockHash: rec.blockHash, anchorTime: rec.timestamp || result.anchorTime, node: rec.node };
        }
      }
      if (anchor.status === "ANCHORED") {
        await integrityRepository.updateLedger(integrity.evidence_id, {
          txHash: anchor.txHash, blockNumber: anchor.blockNumber, network: env.LEDGER_NETWORK || "ibvap-permissioned-poa", status: "ANCHORED", anchoredAt: anchor.anchorTime, attempts: integrity.ledger_attempts + 1,
        });
        const custodyStat = await pushCustody(integrity.evidence_id, "ANCHORED");
        await securityEvents.recordSecurityEvent({ action: "BLOCKCHAIN_ANCHOR", details: { evidenceId, txHash: anchor.txHash, blockNumber: anchor.blockNumber } });
        return anchor;
      }
      return result;
    }
    await integrityRepository.updateLedger(integrity.evidence_id, { status: "PENDING_ANCHOR", attempts: integrity.ledger_attempts + 1, error: result.error });
    metrics.incBlockchainAnchorFailures();
    return result;
  } catch (err) {
    try {
      const integrity = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
      if (integrity) await integrityRepository.updateLedger(integrity.evidence_id, { status: "PENDING_ANCHOR", attempts: integrity.ledger_attempts + 1, error: err.message });
    } catch {}
    metrics.incBlockchainAnchorFailures();
    return { status: "PENDING_ANCHOR", error: err.message };
  }
}

const canonicalMetadataHash = (integrity) => {
  return JSON.stringify({
    bid: String(integrity.id), sid: integrity.signing_key_id, m: integrity.mime_type, fs: integrity.file_size,
  });
};

// Retry loop driver for pending anchors.
async function retryPendingAnchors(limit = 25) {
  const pending = await integrityRepository.listPendingAnchorEvidence(limit);
  const results = [];
  for (const p of pending) {
    const res = await anchorEvidence(p.evidenceCode);
    results.push({ evidenceId: p.evidenceCode, ...res });
  }
  return results;
}

// ─── A4 — verification ─────────────────────────────────────────────────────

async function verifyEvidence({ evidenceId, absolutePath }) {
  const result = { evidenceId, checks: { hash: "NOT_CHECKED", signature: "NOT_CHECKED", blockchain: "NOT_CHECKED", custody: "NOT_CHECKED" }, overall: OVERALL.ERROR };

  const integrity = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
  if (!integrity) return { ...result, overall: OVERALL.ERROR, reason: "integrity record missing" };

  // 1) Re-hash exact bytes and compare to stored hash.
  let hashMatch = false;
  let currentSha256 = null;
  try {
    currentSha256 = await sha256File(absolutePath);
    hashMatch = currentSha256 === integrity.sha256_hash;
  } catch { result.checks.hash = "FILE_READ_ERROR"; }

  if (hashMatch) result.checks.hash = "HASH_MATCH";
  else {
    result.checks.hash = "HASH_MISMATCH";
    result.overall = OVERALL.TAMPERED;
    metrics.incEvidenceTamperDetected();
    await securityEvents.recordSecurityEvent({ action: "EVIDENCE_TAMPERED", details: { evidenceId, expected: integrity.sha256_hash, actual: currentSha256 } });
  }

  // 2) Verify digital signature over the canonical record. Must replay the
  // EXACT signed payload: payload createdAt equals the stored provenance's
  // signedCreatedAt (which may differ from the integrity row's created_at).
  try {
    const provenance = parseProvenance(integrity.provenance_json);
    const sigOk = verifyEvidenceSignature(
      { evidenceId, sha256: integrity.sha256_hash, eventId: provenance.eventId, cameraCode: provenance.cameraCode, createdAt: provenance.signedCreatedAt || null, keyId: integrity.signing_key_id },
      { signature: integrity.signature, publicKeyPem: integrity.public_key_pem }
    );
    result.checks.signature = sigOk ? "SIGNATURE_VALID" : "SIGNATURE_INVALID";
  } catch (err) { result.checks.signature = "SIGNATURE_CHECK_ERROR"; }

  // 3) Ancestored ledger lookup (best-effort; PENDING_ANCHOR is still valid).
  let ledger = null;
  try {
    ledger = await ledgerClient.getEvidenceRecord(evidenceId);
    if (ledger) {
      const ledgerMatch = ledger.sha256 === integrity.sha256_hash && ledger.txHash && Number.isInteger(Number(ledger.blockNumber));
      result.checks.blockchain = ledgerMatch ? "BLOCKCHAIN_CONFIRMED" : "BLOCKCHAIN_MISMATCH";
    } else {
      result.checks.blockchain = integrity.ledger_status === "ANCHORED" ? "LEDGER_UNREACHABLE" : "NOT_ANCHORED";
    }
  } catch { result.checks.blockchain = "LEDGER_UNREACHABLE"; }

  // 4) Chain of custody hash-chain validation.
  const custody = await integrityRepository.getCustodyRecords(evidenceId);
  const chainCheck = validateCustodyChain(custody);
  result.checks.custody = chainCheck.valid ? "CHAIN_OF_CUSTODY_VALID" : "CUSTODY_BROKEN";
  result.custodyCount = custody.length;

  // Overall determination (rules: never VERIFIED on hash mismatch).
  if (!hashMatch) result.overall = OVERALL.TAMPERED;
  else if (result.checks.signature !== "SIGNATURE_VALID") result.overall = OVERALL.PARTIALLY_VERIFIED;
  else if (result.checks.custody !== "CHAIN_OF_CUSTODY_VALID") result.overall = OVERALL.PARTIALLY_VERIFIED;
  else if (result.checks.blockchain === "BLOCKCHAIN_CONFIRMED") result.overall = OVERALL.VERIFIED;
  else if (result.checks.blockchain === "NOT_ANCHORED" || ledger == null) result.overall = OVERALL.NOT_ANCHORED;
  else result.overall = OVERALL.PARTIALLY_VERIFIED;

  result.storedSha256 = integrity.sha256_hash;
  result.currentSha256 = currentSha256;
  result.ledger = ledger || null;
  result.provenance = parseProvenance(integrity.provenance_json);

  if (result.overall === OVERALL.VERIFIED) {
    await securityEvents.recordSecurityEvent({ action: "EVIDENCE_VERIFIED", details: { evidenceId } });
  } else if (result.overall === OVERALL.TAMPERED || result.checks.signature === "SIGNATURE_INVALID") {
    metrics.incEvidenceVerificationFailures();
  }
  return result;
}

// ─── Helper — append a custody record after the current tail ───────────────

async function pushCustody(rowId, action, actorUserId = null, actorRole = null) {
  const prev = (await integrityRepository.lastCustodyHash(rowId)) || NULL_HASH;
  const rec = buildCustodyRecord(prev, { evidenceId: rowId, action, timestamp: new Date().toISOString() });
  await integrityRepository.insertCustody({
    rowId, action, actorUserId, actorRole,
    timestamp: rec.timestamp, previousRecordHash: rec.previousRecordHash, recordHash: rec.recordHash,
  });
  return rec;
}

// ─── B4 — encryption helpers (AES-256-GCM at rest, feature-flagged) ───────

const getActiveKey = () => {
  const keys = require("./crypto.service").keyRing();
  return keys[env.EVIDENCE_ACTIVE_KEY_ID || "ev-enc-v1"];
};

async function encryptStoredFile(evidenceId, absolutePath) {
  if (!env.EVIDENCE_ENCRYPTION_ENABLED) return { status: "DISABLED" };
  const key = getActiveKey();
  if (!key) return { status: "NO_KEY" };
  const plaintext = fs.readFileSync(absolutePath);
  const aad = `evidence:${evidenceId}`;
  const blob = encryptAESGCM(plaintext, key, { keyId: env.EVIDENCE_ACTIVE_KEY_ID, aad });
  fs.writeFileSync(absolutePath + ".enc", blob, "utf8");
  fs.rmSync(absolutePath, { force: true });
  return { status: "ENCRYPTED", keyId: env.EVIDENCE_ACTIVE_KEY_ID || "ev-enc-v1" };
}

async function decryptStoredFile(evidenceId, absolutePath) {
  if (!env.EVIDENCE_ENCRYPTION_ENABLED) return absolutePath;
  if (!fs.existsSync(absolutePath + ".enc")) return absolutePath; // plaintext legacy
  const keys = require("./crypto.service").keyRing();
  let lastErr = null;
  for (const [keyId, keyHex] of Object.entries(keys)) {
    try {
      const plaintext = decryptAESGCM(fs.readFileSync(absolutePath + ".enc", "utf8"), keyHex, { aad: `evidence:${evidenceId}` });
      const tmp = absolutePath + ".tmp";
      fs.writeFileSync(tmp, plaintext);
      return tmp;
    } catch (err) { lastErr = err; }
  }
  throw lastErr || new Error("decrypt failed");
}

module.exports = {
  OVERALL, verifyEvidence, anchorEvidence, retryPendingAnchors, onEvidenceIngested,
  computeIntegrityCore, pushCustody, encryptStoredFile, decryptStoredFile,
  canonicalMetadataHash, _pad: (_evidenceId) => NULL_HASH,
};