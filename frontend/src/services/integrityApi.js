"use strict";

// Evidence-integrity client for the frontend. `verifyEvidenceIntegrity` drives
// the backend capture→hash→sign→custody→ledger→verify pipeline (A1–A12) and
// surfaces a tamper-evident verdict for a single evidence code. Bearer-auth:
// the frontend never handles keys or file bytes here.

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || "http://localhost:5001/api").replace(/\/+$/, "");

const authHeaders = () => {
  const token = globalThis.localStorage?.getItem("ibvap_access_token") || "";
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

async function handle(res, fallback) {
  let body = {};
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error((body?.error || body?.message || fallback).replace(/^EVIDENCE_[A-Z_]+:\s*/i, ""));
  return body;
}

const byEvidence = (evidenceCode, suffix = "") =>
  `${API_BASE}/integrity/${encodeURIComponent(evidenceCode)}${suffix}`;

// Full integrity record for one evidence (leadger anchor + custody chain).
export async function getEvidenceIntegrity(evidenceCode) {
  const res = await fetch(byEvidence(evidenceCode), { headers: authHeaders() });
  return handle(res, "Could not load the integrity record.");
}

// Run the verification pipeline: hash recompute, Ed25519 signature replay,
// custody-chain hash validation, and on-chain ledger lookup.
export async function verifyEvidenceIntegrity(evidenceCode) {
  const res = await fetch(byEvidence(evidenceCode, "/verify"), { method: "POST", headers: authHeaders(), body: "{}" });
  return handle(res, "Evidence verification failed.");
}

// Chain-of-custody records for one evidence.
export async function getEvidenceCustody(evidenceCode) {
  const res = await fetch(byEvidence(evidenceCode, "/custody"), { headers: authHeaders() });
  return handle(res, "Could not load the custody chain.");
}
