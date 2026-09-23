#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

ROOT=$(deployment_root)
ENV_FILE=${1:-$ROOT/.env}

compose() {
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"
}

"$SCRIPT_DIR/check-env.sh" "$ENV_FILE"
"$SCRIPT_DIR/check-models.sh" "$ENV_FILE"

evidence_path=$(env_value EVIDENCE_HOST_PATH "$ENV_FILE")
[ -n "$evidence_path" ] || evidence_path=./storage
evidence_path=$(resolve_host_path "$evidence_path" "$ROOT")
mkdir -p "$evidence_path/snapshots" "$evidence_path/faces" "$evidence_path/plates" "$evidence_path/clips"
if [ ! -w "$evidence_path" ]; then
  printf 'ERROR: evidence path is not writable: %s\n' "$evidence_path" >&2
  printf '%s\n' 'On Linux, grant uid 10001 write access before retrying.' >&2
  exit 1
fi

compose config --quiet
compose build
compose up -d --wait mysql
compose run --rm migrate
compose up -d --wait

"$SCRIPT_DIR/health-check.sh" "$ENV_FILE"
printf '%s\n' 'IBVAP deployment completed successfully.'
