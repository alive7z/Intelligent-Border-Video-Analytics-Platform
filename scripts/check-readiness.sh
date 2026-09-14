#!/usr/bin/env bash
# Read-only checks. Never starts ingestion or probes cameras.
set -u
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
task_failures=0
for task_command in node npm; do
  if command -v "$task_command" >/dev/null 2>&1; then
    printf 'PASS command: %s\n' "$task_command"
  else
    printf 'MISSING command: %s\n' "$task_command"
    task_failures=$((task_failures + 1))
  fi
done
for task_path in backend/node_modules frontend/node_modules ai_engine/.venv/bin/python; do
  if [[ -e "$task_root/$task_path" ]]; then
    printf 'PASS dependency location: %s\n' "$task_path"
  else
    printf 'MISSING dependency location: %s\n' "$task_path"
    task_failures=$((task_failures + 1))
  fi
done
if [[ -x "$task_root/ai_engine/.venv/bin/python" ]]; then
  (cd "$task_root/ai_engine" && .venv/bin/python check_readiness.py) || task_failures=$((task_failures + 1))
fi
printf 'Live cameras, browser rendering, sustained load and accuracy: NOT TESTED by this check.\n'
exit "$task_failures"
