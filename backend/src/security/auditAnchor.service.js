"use strict";

const env = require("../config/env");
const { getPool } = require("../config/database");
const { merkleRoot, sha256 } = require("./merkle");
const { canonicalize } = require("./crypto.service");
const integrityRepository = require("../repositories/integrity.repository");
const ledgerClient = require("../ldr/ledgerClient");
const securityEvents = require("./securityEvents.service");
const metrics = require("./metrics");

// A10/A11 — Régularly anchor audit-log rows to the permissioned ledger as a
// single Merkle root so any audit record can later be proven to have existed
// at anchor time. Failures leave the batch PENDING_ANCHOR and never block
// analytics, evidence writes, or the API.

const BATCH_SIZE = env.LEDGER_BATCH_SIZE || 64;

const auditRowsToLeaves = (rows) =>
  rows.map((row) => sha256(Buffer.from(canonicalize({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    userId: row.user_id,
    createdAt: row.created_at,
  }), "utf8")).toString("hex"));

const lastAnchoredAuditId = async () => {
  const [rows] = await getPool().execute(
    "SELECT COALESCE(MAX(last_audit_id), 0) AS lastId FROM audit_anchor_batches"
  );
  return rows[0].lastId;
};

const fetchUnanchoredAudits = async (afterId, limit) => {
  const [rows] = await getPool().execute(
    `SELECT id, action, entity_type, entity_id, user_id, created_at
       FROM audit_logs WHERE id > ? ORDER BY id ASC LIMIT ?`,
    [afterId, Number(limit)]
  );
  return rows;
};

async function anchorNextAuditBatch() {
  if (env.BLOCKCHAIN_ENABLED === false) return null;
  const afterId = await lastAnchoredAuditId();
  const rows = await fetchUnanchoredAudits(afterId, BATCH_SIZE);
  if (rows.length === 0) return null;

  const leaves = auditRowsToLeaves(rows);
  const root = merkleRoot(leaves);
  const batchKey = `audit-${rows[0].id}-${rows[rows.length - 1].id}`;

  const existing = await integrityRepository.findAuditBatch(batchKey);
  if (!existing) {
    await integrityRepository.insertAuditBatch({
      batchKey,
      firstAuditId: rows[0].id,
      lastAuditId: rows[rows.length - 1].id,
      recordCount: rows.length,
      merkleRoot: root,
      leaves,
    });
  }

  const result = await ledgerClient.anchorBatch({
    batchKey,
    merkleRoot: root,
    recordCount: rows.length,
    firstAuditId: rows[0].id,
    lastAuditId: rows[rows.length - 1].id,
    network: env.LEDGER_NETWORK || "ibvap-permissioned-poa",
    chainId: Number(env.LEDGER_CHAIN_ID || 51201),
  });

  if (result.status === "ANCHORED") {
    await integrityRepository.updateAuditBatchLedger(batchKey, {
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      status: "ANCHORED",
      anchoredAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
    await securityEvents.recordSecurityEvent({ action: "BLOCKCHAIN_ANCHOR", details: { batchKey, txHash: result.txHash, blockNumber: result.blockNumber } });
    return { batchKey, status: "ANCHORED", txHash: result.txHash, blockNumber: result.blockNumber, recordCount: rows.length };
  }

  metrics.incBlockchainAnchorFailures();
  return { batchKey, status: result.status, error: result.error };
}

module.exports = { anchorNextAuditBatch, fetchUnanchoredAudits, auditRowsToLeaves };