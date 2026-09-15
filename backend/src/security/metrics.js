"use strict";

// In-process security counters. Lightweight atomic counters exposed by a
// /metrics (Prometheus text) endpoint. No external deps.

let _failedLogins = 0;
let _rateLimitBlocks = 0;
let _invalidTokens = 0;
let _mfaFailures = 0;
let _evidenceVerificationFailures = 0;
let _evidenceTamperDetected = 0;
let _blockchainAnchorFailures = 0;
let _unauthorizedRequests = 0;
let _successfulLogins = 0;

module.exports = {
  incFailedLogins: () => _failedLogins += 1,
  incRateLimitBlocks: () => _rateLimitBlocks += 1,
  incInvalidTokens: () => _invalidTokens += 1,
  incMfaFailures: () => _mfaFailures += 1,
  incEvidenceVerificationFailures: () => _evidenceVerificationFailures += 1,
  incEvidenceTamperDetected: () => _evidenceTamperDetected += 1,
  incBlockchainAnchorFailures: () => _blockchainAnchorFailures += 1,
  incUnauthorizedRequests: () => _unauthorizedRequests += 1,
  incSuccessfulLogins: () => _successfulLogins += 1,

  snapshot: () => ({
    failed_logins_total: _failedLogins,
    rate_limit_blocks_total: _rateLimitBlocks,
    invalid_tokens_total: _invalidTokens,
    mfa_failures_total: _mfaFailures,
    evidence_verification_failures_total: _evidenceVerificationFailures,
    evidence_tamper_detected_total: _evidenceTamperDetected,
    blockchain_anchor_failures_total: _blockchainAnchorFailures,
    unauthorized_requests_total: _unauthorizedRequests,
    successful_logins_total: _successfulLogins,
  }),

  prometheusText: () => {
    const s = module.exports.snapshot();
    const lines = [
      "# HELP ibvap_security_total Security event counters.",
      "# TYPE ibvap_security_total counter",
    ];
    for (const [k, v] of Object.entries(s)) {
      lines.push(`ibvap_security_total{metric="${k}"} ${v}`);
    }
    return lines.join("\n") + "\n";
  },
};