"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  sha256Hex, sha256File, canonicalize, evidenceCanonicalPayload,
  signEvidenceRecord, verifyEvidenceSignature, encryptAESGCM, decryptAESGCM,
} = require("../src/security/crypto.service");

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("sha256 matches known vector", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("sha256File hashes exact file bytes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibvap-sha-"));
  const f = path.join(dir, "a.bin");
  fs.writeFileSync(f, Buffer.from([0, 1, 2, 3, 255]));
  assert.equal(await sha256File(f), sha256Hex(Buffer.from([0, 1, 2, 3, 255])));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("canonicalize is key-order independent and deterministic", () => {
  assert.equal(
    canonicalize({ b: 1, a: "x", c: [2, { d: 3 }] }),
    canonicalize({ c: [2, { d: 3 }], a: "x", b: 1 })
  );
  assert.equal(canonicalize({ a: 1, b: 2 }), '{"a":1,"b":2}');
});

test("Ed25519 signature round-trips and rejects tampering", () => {
  const rec = {
    evidenceId: "EV-TEST-1", sha256: sha256Hex("bytes"),
    eventId: "EVENT-7", cameraCode: "CAM-01", createdAt: "2026-09-14T12:00:00.000Z",
    keyId: "ev-key-v1",
  };
  const signed = signEvidenceRecord(rec);
  assert.ok(verifyEvidenceSignature(rec, { signature: signed.signature, publicKeyPem: signed.publicKey }));

  const tampered = { ...rec, sha256: sha256Hex("other") };
  assert.ok(!verifyEvidenceSignature(tampered, { signature: signed.signature, publicKeyPem: signed.publicKey }));
});

test("signature is stable only for the exact canonical payload (createdAt matters)", () => {
  const rec = { evidenceId: "EV-TEST-2", sha256: sha256Hex("b"), eventId: "E2", cameraCode: "C", createdAt: "2026-01-01T00:00:00.000Z", keyId: "k1" };
  const signed = signEvidenceRecord(rec);
  const wrongTime = { ...rec, createdAt: "2026-01-02T00:00:00.000Z" };
  assert.ok(!verifyEvidenceSignature(wrongTime, { signature: signed.signature, publicKeyPem: signed.publicKey }));
});

test("AES-256-GCM round-trips with aad and fails on wrong aad", () => {
  const blob = encryptAESGCM("secret-message", KEY, { aad: "evidence:E1" });
  const decrypted = decryptAESGCM(blob, KEY, { aad: "evidence:E1" });
  assert.equal(decrypted.toString("utf8"), "secret-message");
  assert.throws(() => decryptAESGCM(blob, KEY, { aad: "evidence:E2" }));
});

test("AES-256-GCM requires a 32-byte hex key", () => {
  assert.throws(() => encryptAESGCM("x", "short", {}));
});

test("evidenceCanonicalPayload is deterministic", () => {
  const rec = { evidenceId: "E", sha256: sha256Hex(""), eventId: 2, cameraCode: "C1", createdAt: "t", keyId: "k" };
  assert.equal(evidenceCanonicalPayload(rec), evidenceCanonicalPayload({ ...rec, ordering: "ignored" }));
});