"use strict";

const fs = require("fs");
const path = require("path");
const env = require("../config/env");
const auditService = require("../services/audit.service");

// Structured security event channel. Events are (a) persisted through the
// existing audit_logs table (so existing RBAC audit APIs see them), and (b)
// appended as newline-delimited JSON to a local file for SIEM ingestion. This
// is the canonical security audit pathway for the interactive security work.

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const EVENTS_FILE = path.resolve(env.SECURITY_EVENTS_FILE || path.join(REPO_ROOT, "storage", "security-events.ndjson"));

const appendToStream = (event) => {
  if (env.SECURITY_AUDIT_ENABLED === false) return;
  try {
    fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + "\n");
  } catch (err) {
    // Logging must never break the primary operation.
  }
};

// Allowed actions per security spec (B21).
const ACTIONS = new Set([
  "LOGIN_SUCCESS", "LOGIN_FAILED", "MFA_SUCCESS", "MFA_FAILED", "LOGOUT",
  "SESSION_REVOKED", "EVIDENCE_VIEWED", "EVIDENCE_VERIFIED", "EVIDENCE_EXPORTED",
  "EVIDENCE_TAMPERED", "ALERT_ACKNOWLEDGED", "ADMIN_ACTION", "CAMERA_CONFIG_CHANGED",
  "KEY_ROTATION", "BLOCKCHAIN_ANCHOR", "BLOCKCHAIN_ANCHOR_FAILED", "BRUTE_FORCE_LOCKOUT",
  "EVIDENCE_HASHED", "EVIDENCE_SIGNED", "MFA_ENABLED", "SECURITY_HEADERS_SET",
]);

async function recordSecurityEvent({ action, userId = null, role = null, details = null, ipAddress = null, entityType = "security", entityId = null }) {
  if (!ACTIONS.has(action)) return null;
  const event = {
    ts: new Date().toISOString(),
    action,
    userId,
    role,
    ipAddress,
    entityType,
    entityId,
    details: details || null,
  };
  appendToStream(event);
  // Delegate to the existing audit path (records role via subquery).
  await auditService.recordAudit({
    userId,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
  });
  return event;
}

module.exports = { recordSecurityEvent, ACTIONS, EVENTS_FILE };