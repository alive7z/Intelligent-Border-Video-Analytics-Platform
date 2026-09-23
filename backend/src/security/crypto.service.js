"use strict";

const env = require("../config/env");
const crypto = require("crypto");
const {
  generateKeyPairSync, sign: _sign, verify: _verify, randomUUID, createHash,
  createCipheriv, createDecipheriv,
} = require("crypto");

// Returns the list of decryption key candidates. Key IDs are user-supplied
// labels; the raw hex key material is stored in env.
function keyRing() {
  const ring = {};
  if (env.EVIDENCE_MASTER_KEY) {
    ring[env.EVIDENCE_ACTIVE_KEY_ID || "ev-enc-v1"] = env.EVIDENCE_MASTER_KEY;
  }
  // Support a second rotated key that may still be needed for old records.
  if (env.EVIDENCE_KEY_V2) {
    ring[env.EVIDENCE_KEY_V2_ID || "ev-enc-v2"] = env.EVIDENCE_KEY_V2;
  }
  return ring;
}

const loadSigningKey = () => {
  if (!env.EVIDENCE_SIGNING_PRIVATE_KEY) return null;
  const k = crypto.createPrivateKey({
    key: Buffer.from(env.EVIDENCE_SIGNING_PRIVATE_KEY, "utf8"),
    format: "pem",
    passphrase: undefined,
  });
  return { privateKey: k, keyId: env.EVIDENCE_SIGNING_KEY_ID || "ev-key-v1" };
};

const loadSigningPublicKey = (sigKey) => {
  if (env.EVIDENCE_SIGNING_PUBLIC_KEY) {
    try { return crypto.createPublicKey(env.EVIDENCE_SIGNING_PUBLIC_KEY); } catch {}
  }
  return crypto.createPublicKey(sigKey.privateKey);
};

// ─── Hashing ───────────────────────────────────────────────────────────────

const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
const sha256File = (absolutePath) => new Promise((resolve, reject) => {
  const fs = require("fs");
  const h = createHash("sha256");
  const s = fs.createReadStream(absolutePath);
  s.on("data", (c) => h.update(c));
  s.on("end", () => resolve(h.digest("hex")));
  s.on("error", reject);
});

// ─── Canonical payload (deterministic JSON-like) ──────────────────────────

const canonicalize = (obj) => {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(",")}]`;
  if (typeof obj === "object") {
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
  }
  return String(obj);
};

const evidenceCanonicalPayload = (rec) => canonicalize({
  evidenceId: rec.evidenceId,
  sha256: rec.sha256,
  eventId: rec.eventId,
  cameraCode: rec.cameraCode,
  createdAt: rec.createdAt,
  keyId: rec.keyId,
});

const custodyCanonicalPayload = (rec) => canonicalize({
  evidenceId: rec.evidenceId,
  action: rec.action,
  previousRecordHash: rec.previousRecordHash || "",
  timestamp: rec.timestamp,
});

// ─── Ed25519 signatures ───────────────────────────────────────────────────

let _signingPair;
const _ensureSigningPair = () => {
  if (_signingPair) return _signingPair;
  _signingPair = env.EVIDENCE_SIGNING_PRIVATE_KEY ? loadSigningKey() : _generateDevPair();
  return _signingPair;
};

const _generateDevPair = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicKey, keyId: env.EVIDENCE_SIGNING_KEY_ID || "ev-dev-key" };
};

const signEvidenceRecord = (rec) => {
  const pair = _ensureSigningPair();
  const payload = Buffer.from(evidenceCanonicalPayload(rec));
  const sig = _sign(null, payload, { key: pair.privateKey });
  return { signature: sig.toString("base64"), algorithm: "Ed25519", keyId: pair.keyId, publicKey: crypto.createPublicKey(pair.privateKey).export({ type:"spki", format:"pem" }) };
};

const verifyEvidenceSignature = (rec, { signature, publicKeyPem }) => {
  const publicKey = publicKeyPem ? crypto.createPublicKey(publicKeyPem) : _ensureSigningPair().publicKey;
  const payload = Buffer.from(evidenceCanonicalPayload(rec));
  // crypto.verify(null, data, publicKey, signature) — one-shot Ed25519.
  return _verify(undefined, payload, publicKey, Buffer.from(signature, "base64"));
};

// ─── AES-256-GCM ───────────────────────────────────────────────────────────

const MAX_PLAINTEXT = 10 * 1024 * 1024;

const encryptAESGCM = (plaintext, keyHex, { keyId, aad } = {}) => {
  if (!keyHex) throw new Error("AES-GCM: keyHex required");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("AES-GCM: key must be 32 bytes (64 hex)");
  const iv = crypto.randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  if (aad) cipher.setAAD(Buffer.from(typeof aad === "string" ? aad : JSON.stringify(aad)));
  const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8");
  if (input.length > MAX_PLAINTEXT) throw new Error("plaintext too large");
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Storage format: iv(12).tag(16).encrypted . Base64 for transport.
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decryptAESGCM = (b64, keyHex, { aad } = {}) => {
  if (!b64) return null;
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 28) throw new Error("AES-GCM: invalid blob");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  if (aad) decipher.setAAD(Buffer.from(typeof aad === "string" ? aad : JSON.stringify(aad)));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted;
};

// ─── HMAC-SHA256 helpers ──────────────────────────────────────────────────

const hmac = (secret, payload) => createHash("sha256").update(`${secret}:${payload}`).digest("hex");

module.exports = {
  sha256Hex, sha256File, canonicalize, evidenceCanonicalPayload,
  signEvidenceRecord, verifyEvidenceSignature, _ensureSigningPair,
  encryptAESGCM, decryptAESGCM, hmac,
  custodyCanonicalPayload, randomUUID,
};