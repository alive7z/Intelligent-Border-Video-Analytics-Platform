#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

ROOT=$(deployment_root)
ENV_FILE=${1:-$ROOT/.env}
BASE_URL=$(env_value HEALTHCHECK_URL "$ENV_FILE")
[ -n "$BASE_URL" ] || BASE_URL=http://127.0.0.1
BASE_URL=${BASE_URL%/}

compose() {
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" "$@"
}

printf '%s\n' 'Container status:'
compose ps

for service in mysql backend ai-engine frontend nginx-gateway; do
  container_id=$(compose ps -q "$service")
  [ -n "$container_id" ] || {
    printf 'ERROR: required service is not running: %s\n' "$service" >&2
    exit 1
  }
  state=$(docker inspect --format '{{.State.Status}}' "$container_id")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")
  printf '%-16s state=%s health=%s\n' "$service" "$state" "$health"
  [ "$state" = "running" ] || exit 1
  [ "$health" = "healthy" ] || exit 1
done

curl --fail --silent --show-error "$BASE_URL/" >/dev/null
curl --fail --silent --show-error "$BASE_URL/api/health" >/dev/null
printf 'Gateway and backend health checks passed at %s.\n' "$BASE_URL"
