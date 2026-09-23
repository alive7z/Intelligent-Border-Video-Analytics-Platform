# On-chain vs Off-chain Matrix — IBVAP

Explicit split of what lives in the permissioned PoA ledger vs the relational DB,
plus the integration points and the tamper-evidence guarantee each layer adds.

| Artifact | On-chain (ledger) | Off-chain (DB/files) | Link | Guarantee |
|----------|-------------------|----------------------|------|-----------|
| Evidence file bytes | no (hash only) | yes — disk | `sha256` | A2 (Tamper-evidence proof) |
| SHA-256 digest | yes — `REGISTER_EVIDENCE` payload | yes — `evidence_integrity.sha256_hash` | digest equality | A2 + A6 |
| Ed25519 signature | no | yes — `signature` + pub key | signature replay | A3 |
| Chain-of-custody records | no | yes — custody table (`previous_record_hash` chain) | cumulative hash | A5 |
| Audit-batch Merkle root | yes — `REGISTER_AUDIT_BATCH` | yes — batch row | merkleRoot | A7 |
| Access tokens / MFA / recovery | no | yes — DB (hashed) | — | Auth hardening |
| Ledger anchor proof | yes — tx + block | yes — `ledger_tx_hash`, `ledger_status` | on-chain read-back | A6/A9/A11 |

## Rule of thumb

- **On-chain** stores one cryptographic commitment (digest / Merkle root) +
  chain/block metadata — small, cheap, tamper-resistant.
- **Off-chain** stores the full artifact + signature + custody history needed to
  *explain* and *replay* the commitment deterministically.
- **The integration contract**: any evidence that claims on-chain anchorage must
  reproduce the exact digest committed in the ledger; otherwise verdict is
  `TAMPERED`/`PARTIALLY_VERIFIED`.

## On-chain vs off-chain at a glance

**ON-CHAIN (permissioned PoA ledger, chain-id 51201)**
- SHA-256 digests of evidence files
- Audit-batch Merkle roots
- Ledger metadata (chain-id, network, block hashes, timestamps)
- Anchor transaction data (`REGISTER_EVIDENCE`, `REGISTER_AUDIT_BATCH`)

**OFF-CHAIN (DB / storage)**
- Snapshots, plate crops, and face evidence files
- Ed25519 signatures and public keys
- Chain-of-custody records
- Event/alert explanations and operational metadata
- MFA/recovery hashes and access-token revocation data

No raw image/video is stored on-chain.

## Demo loads

- Evidence: `EVID=ev-demo-*` registered on node 8541 and read back over RPC.
- Audit batch: `REGISTER_AUDIT_BATCH` with computed `merkleRoot` on 8541–8543.
- `ledger/reg-demo.sh` automates register + read-back (env: `LEDGER_NODE_TOKEN`,
  `LEDGER_PORT`).

## Backend integration constants (see `backend/.env.example`)

`EVIDENCE_INTEGRITY_ENABLED`,
`LEDGER_RPC_URL`, `LEDGER_NODE_TOKEN`, `BLOCKCHAIN_ENABLED`, `LEDGER_CHAIN_ID`.
