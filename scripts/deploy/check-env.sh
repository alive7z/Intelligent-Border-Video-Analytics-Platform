#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

ROOT=$(deployment_root)
ENV_FILE=${1:-$ROOT/.env}

[ -f "$ENV_FILE" ] || {
  printf 'Deployment environment file not found: %s\nCopy deploy.env.example to .env first.\n' "$ENV_FILE" >&2
  exit 1
}

errors=0

require_secret() {
  key="$1"
  minimum="$2"
  value=$(env_value "$key" "$ENV_FILE")
  case "$value" in
    ""|*REPLACE_ME*|*replace_me*|changeme|change-me)
      printf 'ERROR: %s must be set to a unique secret.\n' "$key" >&2
      errors=$((errors + 1))
      return
      ;;
  esac
  if [ "${#value}" -lt "$minimum" ]; then
    printf 'ERROR: %s must contain at least %s characters.\n' "$key" "$minimum" >&2
    errors=$((errors + 1))
  fi
}

require_secret DB_PASSWORD 12
require_secret MYSQL_ROOT_PASSWORD 12
require_secret JWT_SECRET 32
require_secret AI_SERVICE_TOKEN 32
require_secret PREVIEW_TOKEN_SECRET 32

db_password=$(env_value DB_PASSWORD "$ENV_FILE")
root_password=$(env_value MYSQL_ROOT_PASSWORD "$ENV_FILE")
if [ -n "$db_password" ] && [ "$db_password" = "$root_password" ]; then
  printf 'ERROR: DB_PASSWORD and MYSQL_ROOT_PASSWORD must be different.\n' >&2
  errors=$((errors + 1))
fi

profiles=$(env_value COMPOSE_PROFILES "$ENV_FILE")
blockchain_enabled=$(env_value BLOCKCHAIN_ENABLED "$ENV_FILE")
if profile_enabled ledger "$profiles" || [ "$blockchain_enabled" = "true" ]; then
  require_secret LEDGER_NODE_TOKEN 32
fi

if profile_enabled monitoring "$profiles"; then
  require_secret GRAFANA_ADMIN_PASSWORD 12
fi

encryption_enabled=$(env_value EVIDENCE_ENCRYPTION_ENABLED "$ENV_FILE")
mfa_required=$(env_value MFA_ADMIN_REQUIRED "$ENV_FILE")
if [ "$encryption_enabled" = "true" ] || [ "$mfa_required" = "true" ]; then
  master_key=$(env_value EVIDENCE_MASTER_KEY "$ENV_FILE")
  case "$master_key" in
    ""|*[!0-9a-fA-F]*)
      printf 'ERROR: EVIDENCE_MASTER_KEY must be a 64-character hexadecimal key when encryption or MFA is enabled.\n' >&2
      errors=$((errors + 1))
      ;;
    *) ;;
  esac
  if [ "${#master_key}" -ne 64 ]; then
    printf 'ERROR: EVIDENCE_MASTER_KEY must contain exactly 64 hexadecimal characters.\n' >&2
    errors=$((errors + 1))
  fi
fi

redis_enabled=$(env_value REDIS_ENABLED "$ENV_FILE")
if profile_enabled cache "$profiles" && [ "$redis_enabled" != "true" ]; then
  printf 'WARNING: cache profile is enabled but REDIS_ENABLED is not true; Redis will run unused.\n' >&2
fi

if [ "$errors" -ne 0 ]; then
  printf 'Environment validation failed with %s error(s).\n' "$errors" >&2
  exit 1
fi

printf 'Environment validation passed (%s).\n' "$ENV_FILE"
