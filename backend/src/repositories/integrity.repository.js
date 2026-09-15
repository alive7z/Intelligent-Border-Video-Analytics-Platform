"use strict";

const { getPool } = require("../config/database");

// Persistence for the evidence integrity layer (evidence_integrity,
// chain_of_custody, audit_anchor_batches, token_revocations). All queries use
// parameterized SQL. Integrity tables reference the numeric evidence FK; every
// public lookup resolves rows through the evidence_code join so callers never
// need to know internal ids. Evidence binaries never touch MySQL.

const insertIntegrity = async ({
  evidenceId, sha256, fileSize, mimeType, signature, signatureAlgorithm,
  signingKeyId, publicKeyPem, provenance, ledgerStatus = "PENDING_ANCHOR",
}) => {
  const [r] = await getPool().execute(
    `INSERT INTO evidence_integrity
      (evidence_id, sha256_hash, file_size, mime_type, hash_algorithm, signature,
       signature_algorithm, signing_key_id, public_key_pem, ledger_status, provenance_json)
     VALUES (?, ?, ?, ?, 'SHA-256', ?, ?, ?, ?, ?, ?)`,
    [evidenceId, sha256, fileSize, mimeType, signature, signatureAlgorithm,
      signingKeyId, publicKeyPem || null, ledgerStatus,
      provenance ? JSON.stringify(provenance) : null]
  );
  return r.insertId;
};

// Public-code lookup: resolves the numeric evidence row via evidence_code.
const getIntegrityByEvidenceId = async (evidenceCode) => {
  const [rows] = await getPool().execute(
    `SELECT i.*, e.evidence_code, e.event_id AS ev_event_id, e.alert_id AS ev_alert_id,
            e.camera_id AS ev_camera_id, e.captured_at AS ev_captured_at, c.camera_code
       FROM evidence_integrity i
       JOIN evidence e ON e.id = i.evidence_id
       LEFT JOIN cameras c ON c.id = e.camera_id
      WHERE e.evidence_code = ? LIMIT 1`,
    [evidenceCode]
  );
  return rows[0] || null;
};

const getIntegrityByRowId = async (rowId) => {
  const [rows] = await getPool().execute(
    `SELECT i.*, e.evidence_code FROM evidence_integrity i
      JOIN evidence e ON e.id = i.evidence_id WHERE i.evidence_id = ? LIMIT 1`,
    [rowId]
  );
  return rows[0] || null;
};

const updateLedger = async (rowId, { txHash, blockNumber, network, status, attempts, error, anchoredAt }) => {
  await getPool().execute(
    `UPDATE evidence_integrity
        SET ledger_tx_hash = COALESCE(?, ledger_tx_hash),
            ledger_block_number = COALESCE(?, ledger_block_number),
            ledger_network = COALESCE(?, ledger_network),
            ledger_status = ?,
            ledger_attempts = ?,
            ledger_error = ?,
            anchored_at = COALESCE(?, anchored_at)
      WHERE evidence_id = ?`,
    [txHash ?? null, blockNumber ?? null, network ?? null, status, attempts, error ?? null, anchoredAt ?? null, rowId]
  );
};

const insertCustody = async ({ rowId, action, actorUserId, actorRole, timestamp, previousRecordHash, recordHash }) => {
  const [r] = await getPool().execute(
    `INSERT INTO chain_of_custody
      (evidence_id, action, actor_user_id, actor_role, occurred_at, previous_record_hash, record_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [rowId, action, actorUserId ?? null, actorRole ?? null, timestamp, previousRecordHash, recordHash]
  );
  return r.insertId;
};

const getCustodyRecords = async (evidenceCode) => {
  const [rows] = await getPool().execute(
    `SELECT c.* FROM chain_of_custody c
       JOIN evidence e ON e.id = c.evidence_id
      WHERE e.evidence_code = ? ORDER BY c.id ASC`,
    [evidenceCode]
  );
  return rows.map((r) => ({
    id: r.id, evidenceId: r.evidence_id, action: r.action,
    actorUserId: r.actor_user_id, actorRole: r.actor_role,
    timestamp: r.occurred_at, previousRecordHash: r.previous_record_hash, recordHash: r.record_hash,
  }));
};

const lastCustodyHash = async (rowId) => {
  const [rows] = await getPool().execute(
    "SELECT record_hash FROM chain_of_custody WHERE evidence_id = ? ORDER BY id DESC LIMIT 1",
    [rowId]
  );
  return rows[0] ? rows[0].record_hash : null;
};

// ─── Audit batches (A10) ───────────────────────────────────────────────────

const insertAuditBatch = async ({ batchKey, firstAuditId, lastAuditId, recordCount, merkleRoot, leaves }) => {
  const [r] = await getPool().execute(
    `INSERT INTO audit_anchor_batches
      (batch_key, first_audit_id, last_audit_id, record_count, merkle_root, merkle_leaves_sha256, status)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING_ANCHOR')`,
    [batchKey, firstAuditId, lastAuditId, recordCount, merkleRoot, JSON.stringify(leaves)]
  );
  return r.insertId;
};

const updateAuditBatchLedger = async (batchKey, { txHash, blockNumber, status, anchoredAt }) => {
  await getPool().execute(
    `UPDATE audit_anchor_batches
        SET ledger_tx_hash = ?, ledger_block_number = ?, status = ?, anchored_at = ?
      WHERE batch_key = ?`,
    [txHash ?? null, blockNumber ?? null, status, anchoredAt ?? null, batchKey]
  );
};

const findAuditBatch = async (batchKey) => {
  const [rows] = await getPool().execute(
    "SELECT * FROM audit_anchor_batches WHERE batch_key = ? LIMIT 1",
    [batchKey]
  );
  return rows[0] || null;
};

// ─── Token revocation (B10) ────────────────────────────────────────────────

const insertRevocation = async ({ jti, userId, reason }) => {
  await getPool().execute(
    "INSERT IGNORE INTO token_revocations (jti, user_id, reason) VALUES (?, ?, ?)",
    [jti, userId ?? null, reason ?? "logout"]
  );
};

const findRevocation = async (jti) => {
  const [rows] = await getPool().execute(
    "SELECT jti FROM token_revocations WHERE jti = ? LIMIT 1",
    [jti]
  );
  return rows[0] || null;
};

// ─── Pending anchors (D) ───────────────────────────────────────────────────

const listPendingAnchorEvidence = async (limit = 25) => {
  const [rows] = await getPool().execute(
    `SELECT i.evidence_id AS rowId, e.evidence_code AS evidenceCode, i.ledger_attempts
       FROM evidence_integrity i JOIN evidence e ON e.id = i.evidence_id
      WHERE i.ledger_status IN ('PENDING_ANCHOR','FAILED')
      ORDER BY i.ledger_attempts ASC, i.id ASC LIMIT ?`,
    [Number(limit)]
  );
  return rows;
};

const countIntegrityByStatus = async (status) => {
  if (!status) {
    const [rows] = await getPool().execute("SELECT COUNT(*) AS n FROM evidence_integrity");
    return rows[0].n;
  }
  const [rows] = await getPool().execute("SELECT COUNT(*) AS n FROM evidence_integrity WHERE ledger_status = ?", [status]);
  return rows[0].n;
};

module.exports = {
  insertIntegrity, getIntegrityByEvidenceId, getIntegrityByRowId, updateLedger,
  insertCustody, getCustodyRecords, lastCustodyHash,
  insertAuditBatch, updateAuditBatchLedger, findAuditBatch,
  insertRevocation, findRevocation, listPendingAnchorEvidence, countIntegrityByStatus,
};