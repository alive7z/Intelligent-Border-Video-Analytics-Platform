# Blockchain / On-chain Integrity — IBVAP

Walk-through of the tamper-evident evidence pipeline (A1–A12) implemented in the
IBVAP demo, end to end, including the exact configuration knobs and the verify
verdict semantics. Pair with `docs/onchain-offchain-matrix.md` (what is
on-chain vs off-chain) and `docs/threat-model.md` (what each step defends).

## Ledger summary

- Custom permissioned Proof-of-Authority (PoA) ledger implemented in Python
  (`ledger/ledger.py`), stdlib-only, HMAC-authorized blocks.
- Chain ID: `51201`; network: `ibvap-permissioned-poa`.
- Demo nodes: BOP (8541) · Sector-HQ (8542) · Command-Centre (8543),
  loopback-bound over HTTP in demo scope.
- Ledger transaction types: `REGISTER_EVIDENCE`, `REGISTER_AUDIT_BATCH`.
- No Ethereum / Solidity / Solana / Web3 dependencies; no tokens or mining.
- Only integrity metadata / digests / Merkle roots are anchored on-chain;
  evidence files and signatures remain off-chain.

## Pipeline (A1–A12)

### A1 · Capture
Evidence payloads (snapshot, plate crop, vehicle faces) land from the media
ingester. Canonicalisable field set is frozen at capture.

### A2 · Hash (off-chain, tamper-evident foundation)
- `crypto.service.sha256File(absolutePath)` → streaming SHA-256 over the
  **exact captured bytes**.
- `crypto.service.canonicalize(obj)` → deterministic, key-order-independent
  serialisation used for every payload digest (custody, ledger leaf, batch root).

### A3 · Sign (Ed25519, offline-replayable)
- `signEvidenceRecord(record)` → Ed25519 signature (Node `crypto`) over
  `canonicalize(evidenceCanonicalPayload(record))`.
- `verifyEvidenceSignature` replays the same bytes; signature is independent of
  the ledger so a ledger outage never blocks verification.

### A4 · Store integrity provenance (off-chain, anchored)
`evidence_integrity` row persists: `sha256_hash`, `signature`,
`signature_algorithm`, `signing_key_id`, `public_key_pem`, `ledger_status`,
`ledger_tx_hash`, `ledger_block_number`, `anchored_at`, `provenance_json`.

### A5 · Chain of custody (off-chain hash chain)
Each custody transition (`buildCustodyRecord` → `validateCustodyChain`)
links `sha256(previousRecordHash || canonicalize(payload))`, with a
`NULL_HASH` for the first record. Records carry actor/role/timestamp where
applicable. See `backend/src/security/custody.js`.

### A6 · Ledger anchor (on-chain, permissioned PoA ledger registration)
`anchorEvidence` pushes a `REGISTER_EVIDENCE` ledger transaction:
`{ evidenceId, sha256, metadataHash, cameraCode, eventId, createdAt, keyId, chainId }`.
Duplicates (409) that already carry the digest are treated as **already
anchored** (idempotent).
`ledgerClient.getEvidenceRecord` reads the anchor back from the ledger for
verification.

### A7 · Audit-batch Merkle root (on-chain batch integrity)
- Audit rows are grouped (batch size 64) into canonical SHA-256 leaves;
  `merkleRoot` produces the batch root.
- `REGISTER_AUDIT_BATCH` anchors
  `{ batchKey, merkleRoot, recordCount, firstAuditId, lastAuditId, network, chainId }`.

### A8 · PoA block sealing (permissioned ledger)
Demo nodes (3) seal blocks:
- BOP · Sector-HQ · Command-Centre.
- Each block carries an SHA-256 `prevHash` link, a Merkle root over its
  transaction hashes, an HMAC-SHA256 block signature (node token), and full
  `commit_block` validation including duplicate-transaction rejection.
- Kept demo-ready via `ledger/demo-start.sh` (default 8541-8543; a node token
  must be supplied with `LEDGER_NODE_TOKEN`).

### A9 · Verify (read path)
`verifyEvidence` runs the whole pipeline replay:
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

### A11 · Ledger anchor confirmation
`anchorEvidence` returns `txHash`, `blockNumber`, `blockHash`, `node`,
`timestamp`; the backend records `ledger_tx_hash` +
`ledger_status=ANCHORED` and appends an ANCHORED custody event.

### A12 · Audit anchor scheduling
The scheduler runs every **30 seconds**: `retryPendingAnchors(25)` retries
PENDING_ANCHOR evidence, then `anchorNextAuditBatch` anchors the next audit
batch (see `backend/src/services/scheduler.service.js`). Failures leave batch
records PENDING_ANCHOR and never block analytics, evidence writes, or the API.

## Configuration (`.env` / env-vars)

```
LEDGER_RPC_URL=http://127.0.0.1:8541   # demo node (http:// on loopback)
LEDGER_NODE_TOKEN=<matches the demo node token>
BLOCKCHAIN_ENABLED=true
EVIDENCE_INTEGRITY_ENABLED=true
LEDGER_CHAIN_ID=51201
LEDGER_NETWORK=ibvap-permissioned-poa
LEDGER_BATCH_SIZE=64
```

## Key material / signing notes

- Signing keys are configured via env (`EVIDENCE_SIGNING_PRIVATE_KEY`,
  `EVIDENCE_SIGNING_PUBLIC_KEY`, `EVIDENCE_SIGNING_KEY_ID`); with no key
  configured a development keypair is generated in memory for the session.
- The **public** key is stored with the record; the private signing key stays
  server-side only and is never exposed to the browser.
- The RPC client supports `https:` for production ledger endpoints; the demo
  ledger runs plain HTTP on loopback (8541–8543). Production must terminate TLS.
- The ledger is a tamper-evident integrity-anchoring layer, not an immutable
  public chain — anchor proofs are verified by on-chain read-back.
