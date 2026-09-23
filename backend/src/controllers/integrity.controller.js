"use strict";

const integrityService = require("../security/integrity.service");
const integrityRepository = require("../repositories/integrity.repository");
const evidenceService = require("../services/evidence.service");
const ledgerClient = require("../ldr/ledgerClient");
const securityEvents = require("../security/securityEvents.service");
const metrics = require("../security/metrics");
const { sendSuccess } = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");

// Evidence integrity endpoints (Part A / F). All are read-only except the
// explicit verify action; no evidence bytes are written or exposed here.

const detail = async (req, res) => {
  const { evidenceId } = req.params;
  const integrity = await integrityRepository.getIntegrityByEvidenceId(evidenceId);
  if (!integrity) return sendSuccess(res, 200, "No integrity record yet for this evidence", { evidenceId, record: null });
  const custody = await integrityRepository.getCustodyRecords(evidenceId);
  return sendSuccess(res, 200, "Integrity record", {
    evidenceId,
    record: {
      sha256Hash: integrity.sha256_hash,
      hashAlgorithm: integrity.hash_algorithm,
      signatureAlgorithm: integrity.signature_algorithm,
      signingKeyId: integrity.signing_key_id,
      ledgerStatus: integrity.ledger_status,
      ledgerTxHash: integrity.ledger_tx_hash,
      ledgerBlock: integrity.ledger_block_number,
      ledgerNetwork: integrity.ledger_network,
      anchoredAt: integrity.anchored_at,
      provenance: integrity.provenance_json ? JSON.parse(integrity.provenance_json) : null,
      createdAt: integrity.created_at,
    },
    custodyCount: custody.length,
  });
};

const verify = async (req, res) => {
  const { evidenceId } = req.params;
  let absolutePath;
  try {
    const file = await evidenceService.getEvidenceFile(evidenceId);
    absolutePath = file.absolute;
  } catch (err) {
    throw new ApiError(404, "Evidence file not found on disk for verification");
  }
  const result = await integrityService.verifyEvidence({ evidenceId, absolutePath });
  await securityEvents.recordSecurityEvent({ action: "EVIDENCE_VIEWED", userId: req.user.userId, details: { evidenceId } });
  return sendSuccess(res, 200, "Evidence verification result", result);
};

const custody = async (req, res) => {
  const { evidenceId } = req.params;
  const records = await integrityRepository.getCustodyRecords(evidenceId);
  return sendSuccess(res, 200, "Chain of custody", { evidenceId, records });
};

const ledger = async (req, res) => {
  const { evidenceId } = req.params;
  let record = null;
  let error = null;
  try {
    record = await ledgerClient.getEvidenceRecord(evidenceId);
  } catch (err) {
    error = err.message;
  }
  if (!record && !error) error = "NOT_FOUND";
  return sendSuccess(res, 200, "Ledger record", { evidenceId, record, error });
};

module.exports = { detail, verify, custody, ledger };