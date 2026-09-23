#!/bin/sh
set -eu

if [ -z "${LEDGER_NODE_TOKEN:-}" ]; then
  printf '%s\n' 'Ledger startup error: LEDGER_NODE_TOKEN must be set.' >&2
  exit 1
fi

exec python /ledger/ledger.py --token "$LEDGER_NODE_TOKEN" "$@"
