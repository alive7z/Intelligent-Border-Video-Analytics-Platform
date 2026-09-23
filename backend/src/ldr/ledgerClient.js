"use strict";

const http = require("http");
const https = require("https");
const env = require("../config/env");

// Minimal HTTP JSON-RPC client for the IBVAP permissioned PoA ledger.
// No external dependencies; retries internally. The ledger is purely an
// integrity-anchoring layer — the client must never block evidence write
// paths and must degrade to PENDING_ANCHOR on failure.

const DEFAULT_TIMEOUT_MS = 12000;

const _parse = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

const _httpRequest = (url, body, timeout = DEFAULT_TIMEOUT_MS) => new Promise((resolve, reject) => {
  if (!env.BLOCKCHAIN_ENABLED || !url) return reject(new Error("blockchain disabled"));
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;
  const chunks = [];
  const bodyBuf = Buffer.from(body || "{}", "utf8");
  const req = client.request({
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
    path: parsed.pathname + (parsed.search || ""),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": bodyBuf.length, // explicit Content-Length avoids chunked transfer-encoding
      ...(env.LEDGER_NODE_TOKEN ? { "X-Ledger-Token": env.LEDGER_NODE_TOKEN } : {}),
    },
    timeout,
  }, (res) => {
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const status = res.statusCode;
      const parsed = _parse(Buffer.concat(chunks).toString());
      if (status >= 400) return reject({ status, body: parsed, message: `ledger ${status}` });
      resolve(parsed);
    });
  });
  req.on("error", reject);
  req.on("timeout", () => { req.destroy(); reject(new Error("ledger timeout")); });
  req.write(bodyBuf);
  req.end();
});

const _post = (path, payload) => _httpRequest(`${env.LEDGER_RPC_URL}${path}`, JSON.stringify(payload));

// ─── Public helpers ────────────────────────────────────────────────────────

async function status() {
  return _post("/status", {});
}

async function health() {
  return _post("/health", {});
}

async function registerEvidence(evidenceRecord) {
  if (!env.BLOCKCHAIN_ENABLED) return { status: "PENDING_ANCHOR", reason: "ledger disabled" };
  try {
    const res = await _post("/tx", {
      nodeToken: env.LEDGER_NODE_TOKEN,
      op: "REGISTER_EVIDENCE",
      payload: evidenceRecord,
    });
return { status: "ANCHORED", txHash: res.txHash, blockNumber: res.blockNumber, blockHash: res.blockHash, anchorTime: res.timestamp || new Date().toISOString(), node: res.node };
  } catch (err) {
    return { status: "PENDING_ANCHOR", error: (err && err.body && err.body.error) || (err && err.message) || String(err) };
  }
}

async function getEvidenceRecord(evidenceId) {
  try { return await _post("/evidence/" + encodeURIComponent(evidenceId), {}); } catch { return null; }
}

async function getAuditBatch(batchId) {
  try { return await _post("/batch/" + encodeURIComponent(batchId), {}); } catch { return null; }
}

async function anchorBatch(batch) {
  if (!env.BLOCKCHAIN_ENABLED) return { status: "PENDING_ANCHOR", reason: "ledger disabled" };
  try {
    const res = await _post("/tx", {
      nodeToken: env.LEDGER_NODE_TOKEN,
      op: "REGISTER_AUDIT_BATCH",
      payload: batch,
    });
    return { status: "ANCHORED", txHash: res.txHash, blockNumber: res.blockNumber, anchorTime: res.timestamp };
  } catch (err) {
    return { status: "PENDING_ANCHOR", error: (err && err.stack ? err.stack : String(err)).slice(0, 500) };
  }
}

async function ledgerInfo() {
  try { return await _post("/ledger", {}); } catch { return null; }
}

module.exports = { status, health, registerEvidence, getEvidenceRecord, anchorBatch, getAuditBatch, ledgerInfo, _httpRequest };