#!/bin/bash
# Start the 3-node IBVAP permissioned PoA demo ledger (BOP / Sector HQ /
# Command Centre). No Docker required — plain python3 + stdlib.
set -euo pipefail
cd "$(dirname "$0")"

: "${LEDGER_NODE_TOKEN:?Set LEDGER_NODE_TOKEN before starting the demo ledger}"
TOKEN="$LEDGER_NODE_TOKEN"
CHAIN_ID="${LEDGER_CHAIN_ID:-51201}"

pids=()
cleanup() {
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "hard resetting demo ledger state"
rm -rf data/BOP data/Sector-HQ data/Command-Centre

python3 ledger.py --node-id BOP --port 8541 --chain-id "$CHAIN_ID" --token "$TOKEN" \
  --peers 127.0.0.1:8542,127.0.0.1:8543 &
pids+=("$!")
python3 ledger.py --node-id Sector-HQ --port 8542 --chain-id "$CHAIN_ID" --token "$TOKEN" \
  --peers 127.0.0.1:8541,127.0.0.1:8543 &
pids+=("$!")
python3 ledger.py --node-id Command-Centre --port 8543 --chain-id "$CHAIN_ID" --token "$TOKEN" \
  --peers 127.0.0.1:8541,127.0.0.1:8542 &
pids+=("$!")

sleep 1.5

echo "ledger nodes up:"
for port in 8541 8542 8543; do
  curl -s -X POST "http://127.0.0.1:${port}/status" | python3 -m json.tool
done

echo "ledger demo running. press Ctrl-C (or kill the script) to stop."
wait
