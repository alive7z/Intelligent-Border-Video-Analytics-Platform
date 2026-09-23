#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

ROOT=$(deployment_root)
ENV_FILE=${1:-$ROOT/.env}
BACKUP_ROOT=${2:-$ROOT/backups}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DESTINATION=$BACKUP_ROOT/$STAMP

[ -f "$ENV_FILE" ] || {
  printf 'Deployment environment file not found: %s\n' "$ENV_FILE" >&2
  exit 1
}

compose() {
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"
}

evidence_path=$(env_value EVIDENCE_HOST_PATH "$ENV_FILE")
[ -n "$evidence_path" ] || evidence_path=./storage
evidence_path=$(resolve_host_path "$evidence_path" "$ROOT")

mkdir -p "$DESTINATION"

compose exec -T mysql sh -c \
  'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  >"$DESTINATION/mysql.sql"

tar -C "$evidence_path" -czf "$DESTINATION/evidence.tar.gz" .

printf 'MySQL and evidence backups created in %s\n' "$DESTINATION"
printf '%s\n' 'Ledger named volumes require a separate volume snapshot; see docs/docker-deployment.md.'
