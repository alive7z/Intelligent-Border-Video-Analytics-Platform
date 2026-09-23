#!/usr/bin/env bash
# Register sample evidence + audit batch on the demo ledger and read them back.
set -euo pipefail
cd "$(dirname "$0")"
: "${LEDGER_NODE_TOKEN:?Set LEDGER_NODE_TOKEN before running the ledger demo}"
TOKEN="$LEDGER_NODE_TOKEN"
PORT="${LEDGER_PORT:-8541}"
BASE="http://127.0.0.1:${PORT}"

EVID="ev-demo-$(date +%s)-$RANDOM"
SHA=$(printf 'demo-file-content' | shasum -a 256 | awk '{print $1}')

echo "== REGISTER_EVIDENCE =="
curl -s -X POST "$BASE/tx" -H "Content-Type: application/json" -d "{
  \"nodeToken\": \"$TOKEN\",
  \"op\": \"REGISTER_EVIDENCE\",
  \"payload\": { \"evidenceId\": \"$EVID\", \"sha256\": \"$SHA\", \"keyId\": \"ev-key-v1\", \"chainId\": 51201 }
}" | python3 -m json.tool

echo "== read back =="
curl -s -X POST "$BASE/evidence/$EVID" | python3 -m json.tool

echo "== REGISTER_AUDIT_BATCH (merkle root) =="
curl -s -X POST "$BASE/tx" -H "Content-Type: application/json" -d "{
  \"nodeToken\": \"$TOKEN\",
  \"op\": \"REGISTER_AUDIT_BATCH\",
  \"payload\": { \"batchKey\": \"demo-batch-001\", \"merkleRoot\": \"$(printf 'leaf1' | shasum -a 256 | awk '{print $1}')\", \"recordCount\": 1 }
}" | python3 -m json.tool

echo "== ledger info =="
curl -s -X POST "$BASE/ledger" | python3 -m json.tool
