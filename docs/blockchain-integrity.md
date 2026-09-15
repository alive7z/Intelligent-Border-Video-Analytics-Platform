# Blockchain / On-chain Integrity — IBVAP

Walk-through of the tamper-evident evidence pipeline (A1–A12) implemented in the
IBVAP demo, end to end, including the exact configuration knobs and the verify
verdict semantics. Pair with `docs/onchain-offchain-matrix.md` (what is
on-chain vs off-chain) and `docs/threat-model.md` (what each step defends).

## Pipeline (A1–A12)

### A1 · Capture
Evidence payloads (snapshot, plate crop, vehicle faces) land from the media
ingester. Canonicalisable field set is frozen at capture.

### A2 · Hash (off-chain, tamper-evident foundation)
- `service.crypto.sha256File(file, { strong: true })` → streaming SHA-256 over
  the **exact captured bytes**.
- `service.crypto.canonicalize(obj)` → deterministic, key-order-independent
  serialisation used for every payload digest (custody, ledger leaf, batch root).

### A3 · Sign (Ed25519, offline-replayable)
- `service.crypto.signatureObject({ payload, keyBuffer, ... })` → Ed25519 over
  `canonicalize(payload)`.
- `verifySignatureObject` replays the same bytes; signature is independent of
  the ledger so a ledger outage never blocks verification.

### A4 · Store integrity provenance (off-chain, anchored)
`evidence_integrity` row persists: `sha256`, `signature`, `signature_public_key`,
`signature_algorithm`, `key_id`, `salt`, `algo`, `status` (`INITIAL`), `algo_opts`.

### A5 · Chain of custody (off-chain hash chain)
Each custody transition (`buildCustodyRecord` → `validation`) links:
`sha256(previous_record_hash || canonicalize(payload))`, with `NULL_HASH` for the
first record side. See `backend/src/security/custody.js` and
`backend/src/security/chain-of-custody/*`.

### A6 · Ledger anchor (on-chain, permissioned PoA)
`anchorEvidence` pushes to the node:
- `REGISTER_EVIDENCE` → ledger stores `{ evidenceId, sha256, keyId, chainId }`.
- The stored schema is proof-of-possession: re-hash must reproduce exactly.
`ledgerClient.getEvidenceRecord` returns on-chain rows; duplicates (409) that
already carry the digest are treated as **already anchored** (idempotent).

### A7 · Audit-batch Merkle root (on-chain batch integrity)
- `audit-batch` service groups evidence digests → `buildAuditBatchData`
  (canonical leaves) → `computeMerkleRoot` (SHA-256, standardised pair order).
- `REGISTER_AUDIT_BATCH` anchors `{ batchKey, merkleRoot, recordCount }`.

### A8 · Block mining (permissioned PoA)
Demonstrator nodes (3) seal blocks:
- BOP (Business Operations Point) · Sector-HQ · Command-Centre.
- PoA proposers only; public retries rejected with 409 "already known".
- Kept demo-ready via `ledger/demo-start.sh` (default 8541-8543, node token
  overridable with `LEDGER_NODE_TOKEN`).

### A9 · Verify (read path)
`verifyEvidenceIntegrity` runs the whole pipeline replay:
1. re-hash actual file bytes → compare stored `sha256`;
2. replay Ed25519 signature;
3. validate custody chain (`validateCustodyChain`);
4. read on-chain record via `getEvidenceRecord` and compare digests/`chainId`.

### A10 · Verdicts
| Verdict | Meaning |
|---------|---------|
| `VERIFIED` | hash + signature + custody + ledger all match |
| `TAMPERED` | at least one check fails (bytes/signature/custody/ledger differ) |
| `PARTIALLY_VERIFIED` | sub-set matches, e.g. off-chain ok but ledger absent |
| `NOT_ANCHORED` | evidence exists off-chain but has not yet been ledger-anchored |

### A11 · Ledger notifications (anchor confirmation)
- `anchorEvidence` returns `amount`, `to`, `from`, `blockNumber`, `metadata` and
  token metadata; frontend records `ledgerTxHash` + `ledgerStatus=ANCHORED`.

### A12 · Audit anchor scheduling
`anchorNextAuditBatch` (called by the scheduler) keeps pending evidence
grouped into anchored batches; `retryPendingAnchors` covers outages.

## Configuration (`.env` / env-vars)

```
LEDGER_RPC_URL=   # http://127.0.0.1:8541 (demo; override port via LEDGER_PORT)
LEDGER_NODE_TOKEN=# must equal the demo node's token (default ibvap-ledger-demo-token)
BLOCKCHAIN_ENABLED=true
EVIDENCE_INTEGRITY_ENABLED=true
EVIDENCE_INTEGRITY_MECHANISMS=ed25519-sign,custody-chain,ledger
LEDGER_CHAIN_ID=51201
```

## Key material / signing notes

- Keys are generated at capture and the **public** key is stored with the record.
- Private signing key stays in `EVIDENCE_MASTER_KEY` (server-side only); never
  exposed to the browser.
- `ledgerClient` HTTPS detection: uses `https:` protocol; across HTTP demo port
  8541 sends clear-text (demo). Production must terminate TLS.
