"use strict";

const env = require("../config/env");
const metrics = require("../security/metrics");
const integrityRepository = require("../repositories/integrity.repository");
const integrityService = require("../security/integrity.service");
const ledgerClient = require("../ldr/ledgerClient");
const { sendSuccess } = require("../utils/ApiResponse");

// Admin Security Overview (H) + Prometheus metrics + anchor retry driver.

const overview = async (req, res) => {
  const [total, anchored, pending] = await Promise.all([
    integrityRepository.countIntegrityByStatus(),
    integrityRepository.countIntegrityByStatus("ANCHORED"),
    integrityRepository.countIntegrityByStatus("PENDING_ANCHOR"),
  ]);

  let ledgerReachable = false;
  let ledgerInfo = null;
  try {
    ledgerInfo = await ledgerClient.health();
    ledgerReachable = !!ledgerInfo && ledgerInfo.status === "ok";
  } catch { ledgerReachable = false; }

  return sendSuccess(res, 200, "Security overview", {
    evidenceIntegrity: {
      total, anchored, pendingAnchor: pending,
      integrityEnabled: env.EVIDENCE_INTEGRITY_ENABLED !== false,
      encryptionEnabled: !!env.EVIDENCE_ENCRYPTION_ENABLED,
      signingKeyId: env.EVIDENCE_SIGNING_KEY_ID || "ev-key-v1",
    },
    ledger: {
      enabled: env.BLOCKCHAIN_ENABLED !== false,
      chainId: env.LEDGER_CHAIN_ID || "51201",
      network: env.LEDGER_NETWORK || "ibvap-permissioned-poa",
      node: env.LEDGER_RPC_URL || "http://127.0.0.1:8541",
      reachable: ledgerReachable,
      info: ledgerInfo,
    },
    security: {
      mfaRequiredForAdmins: env.MFA_ADMIN_REQUIRED || false,
      mfaIssue: env.MFA_ISSUER || "IBVAP",
      masterKeyConfigured: !!env.EVIDENCE_MASTER_KEY,
      mtlsEnabled: env.MTLS_ENABLED || false,
      hstsEnabled: env.ENABLE_HSTS === "true",
      metrics: metrics.snapshot(),
    },
  });
};

const metricsText = async (req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return res.send(metrics.prometheusText());
};

const retryAnchors = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const results = await integrityService.retryPendingAnchors(limit);
  return sendSuccess(res, 200, "Anchor retry completed", { processed: results.length, results });
};

module.exports = { overview, metricsText, retryAnchors };