#!/bin/sh
set -eu

fail() {
  printf 'AI startup error: %s\n' "$1" >&2
  exit 1
}

require_file() {
  label="$1"
  path="$2"
  [ -f "$path" ] || fail "$label is missing at $path. Mount the required model file and retry."
  [ -r "$path" ] || fail "$label is not readable at $path."
}

YOLO_MODEL=${YOLO_MODEL:-/models/yolo11n.pt}
ANPR_MODEL_PATH=${ANPR_MODEL_PATH:-/models/license_plate_detector.pt}
FACE_MODEL_PATH=${FACE_MODEL_PATH:-/models/face_detection_yunet_2023mar.onnx}
export YOLO_MODEL ANPR_MODEL_PATH FACE_MODEL_PATH

require_file "YOLO model" "$YOLO_MODEL"
require_file "ANPR model" "$ANPR_MODEL_PATH"
require_file "YuNet face model" "$FACE_MODEL_PATH"
require_file "EasyOCR detector model" "${HOME:-/home/ibvap}/.EasyOCR/model/craft_mlt_25k.pth"
require_file "EasyOCR English recognition model" "${HOME:-/home/ibvap}/.EasyOCR/model/english_g2.pth"

evidence_root="${EVIDENCE_BASE_PATH:-/storage}"
mkdir -p "$evidence_root" "${SNAPSHOT_PATH:-$evidence_root/snapshots}" "${FACE_PATH:-$evidence_root/faces}" \
  || fail "evidence directories could not be created under $evidence_root"
[ -w "$evidence_root" ] || fail "evidence storage is not writable at $evidence_root"

python /app/check_readiness.py || fail "dependency or required model readiness check failed"

exec python /app/main.py "$@"
