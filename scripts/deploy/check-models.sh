#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/common.sh"

ROOT=$(deployment_root)
ENV_FILE=${1:-$ROOT/.env}

[ -f "$ENV_FILE" ] || {
  printf 'Deployment environment file not found: %s\n' "$ENV_FILE" >&2
  exit 1
}

model_dir=$(env_value AI_MODEL_DIR "$ENV_FILE")
ocr_dir=$(env_value EASYOCR_MODEL_DIR "$ENV_FILE")
[ -n "$model_dir" ] || model_dir=./ai_engine/models/weights

model_dir=$(resolve_host_path "$model_dir" "$ROOT")
case "$ocr_dir" in
  /*) ;;
  *)
    printf 'ERROR: EASYOCR_MODEL_DIR must be an absolute host path.\n' >&2
    exit 1
    ;;
esac

missing=0
require_model() {
  label="$1"
  path="$2"
  if [ ! -f "$path" ]; then
    printf 'MISSING: %s (%s)\n' "$label" "$path" >&2
    missing=$((missing + 1))
  elif [ ! -r "$path" ]; then
    printf 'UNREADABLE: %s (%s)\n' "$label" "$path" >&2
    missing=$((missing + 1))
  else
    printf 'READY: %s\n' "$label"
  fi
}

require_model "YOLO model" "$model_dir/yolo11n.pt"
require_model "ANPR model" "$model_dir/license_plate_detector.pt"
require_model "YuNet face model" "$model_dir/face_detection_yunet_2023mar.onnx"
require_model "EasyOCR detector model" "$ocr_dir/craft_mlt_25k.pth"
require_model "EasyOCR English recognition model" "$ocr_dir/english_g2.pth"

if [ "$missing" -ne 0 ]; then
  printf 'Model validation failed: %s required file(s) are unavailable.\n' "$missing" >&2
  exit 1
fi

printf 'All required offline model assets are ready.\n'
