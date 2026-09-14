import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

# ── Application ──────────────────────────────────────────────
APP_ENV = os.getenv("APP_ENV", "development")
AI_SERVICE_NAME = os.getenv("AI_SERVICE_NAME", "IBVAP-AI")
LOG_LEVEL = os.getenv("AI_ENGINE_LOG_LEVEL", "INFO")
PIPELINE_TRACE_ENABLED = os.getenv("PIPELINE_TRACE_ENABLED", "false").lower() == "true"
PIPELINE_TRACE_INTERVAL_SECONDS = max(
    0.2, float(os.getenv("PIPELINE_TRACE_INTERVAL_SECONDS", "1"))
)

# ── FastAPI internal service ─────────────────────────────────
AI_HOST = os.getenv("AI_HOST", "127.0.0.1")
AI_PORT = int(os.getenv("AI_PORT", "8001"))

# ── Node.js backend ──────────────────────────────────────────
NODE_API_URL = os.getenv("NODE_API_URL", "http://localhost:5001/api")
NODE_AI_SERVICE_TOKEN = os.getenv("NODE_AI_SERVICE_TOKEN", "")
NODE_INTEGRATION_ENABLED = os.getenv("NODE_INTEGRATION_ENABLED", "false").lower() == "true"

# ── Video source ─────────────────────────────────────────────
VIDEO_SOURCE = os.getenv("VIDEO_SOURCE", "")

# ── Frame processing ─────────────────────────────────────────
FRAME_SAMPLE_FPS = int(os.getenv("FRAME_SAMPLE_FPS", "5"))
FRAME_WIDTH = int(os.getenv("FRAME_WIDTH", "1280"))
FRAME_HEIGHT = int(os.getenv("FRAME_HEIGHT", "720"))
FRAME_BUFFER_SIZE = int(os.getenv("FRAME_BUFFER_SIZE", "10"))

# ── YOLO Detection ──────────────────────────────────────────
YOLO_MODEL = os.getenv("YOLO_MODEL", "yolo11n.pt")
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.45"))
YOLO_IOU = float(os.getenv("YOLO_IOU", "0.50"))
YOLO_DEVICE = os.getenv("YOLO_DEVICE", "auto")

# ── Tracking ─────────────────────────────────────────────────
ADAPTIVE_SECONDARY_ENABLED = os.getenv("ADAPTIVE_SECONDARY_ENABLED", "true").lower() == "true"
SECONDARY_BUDGET_FRACTION = max(0.05, min(0.5, float(os.getenv("SECONDARY_BUDGET_FRACTION", "0.25"))))
SECONDARY_MAX_FRAME_AGE_MS = max(100.0, float(os.getenv("SECONDARY_MAX_FRAME_AGE_MS", "1500")))

TRACKER = os.getenv("TRACKER", "bytetrack.yaml")
TRACK_CONFIRM_FRAMES = int(os.getenv("TRACK_CONFIRM_FRAMES", "2"))
TRACK_HISTORY_LENGTH = int(os.getenv("TRACK_HISTORY_LENGTH", "30"))
TRACK_TIMEOUT_SECONDS = max(1.0, float(os.getenv("TRACK_TIMEOUT_SECONDS", "60")))

# ── Camera / Source identity ─────────────────────────────────
AI_CAMERA_CODE = os.getenv("AI_CAMERA_CODE", "CAM-01")

# ── Context Intelligence Engine (Phase 9) ────────────────────
CONTEXT_ENABLED = os.getenv("CONTEXT_ENABLED", "true").lower() == "true"
ZONE_CONFIRM_FRAMES = int(os.getenv("ZONE_CONFIRM_FRAMES", "2"))
FENCE_PROXIMITY_THRESHOLD = float(os.getenv("FENCE_PROXIMITY_THRESHOLD", "0.05"))
LOITERING_SECONDS = float(os.getenv("LOITERING_SECONDS", "10"))
LOITERING_RADIUS = float(os.getenv("LOITERING_RADIUS", "0.08"))
DIRECTION_HISTORY_POINTS = int(os.getenv("DIRECTION_HISTORY_POINTS", "5"))
MOVEMENT_HISTORY_POINTS = int(os.getenv("MOVEMENT_HISTORY_POINTS", "5"))
MOVEMENT_MIN_DISPLACEMENT = float(os.getenv("MOVEMENT_MIN_DISPLACEMENT", "0.01"))
REPEATED_ENTRY_WINDOW_SECONDS = float(os.getenv("REPEATED_ENTRY_WINDOW_SECONDS", "60"))
REPEATED_ENTRY_COUNT = int(os.getenv("REPEATED_ENTRY_COUNT", "3"))
NIGHT_START_HOUR = int(os.getenv("NIGHT_START_HOUR", "20"))
NIGHT_END_HOUR = int(os.getenv("NIGHT_END_HOUR", "6"))
CONTEXT_TZ = os.getenv("CONTEXT_TZ", "UTC")
CONTEXT_TIMEOUT_SECONDS = float(os.getenv("CONTEXT_TIMEOUT_SECONDS", "30"))
CONTEXT_CONFIG_REFRESH_SECONDS = float(os.getenv("CONTEXT_CONFIG_REFRESH_SECONDS", "30"))

# ── Risk Engine (Phase 10) ─────────────────────────────────────
RISK_ENABLED = os.getenv("RISK_ENABLED", "true").lower() == "true"
RISK_EVIDENCE_WINDOW_SECONDS = float(os.getenv("RISK_EVIDENCE_WINDOW_SECONDS", "30"))
RISK_HIGH_CONFIRM_MS = int(os.getenv("RISK_HIGH_CONFIRM_MS", "1000"))
RISK_CRITICAL_CONFIRM_MS = int(os.getenv("RISK_CRITICAL_CONFIRM_MS", "2000"))
RISK_SCORE_EMIT_DELTA = float(os.getenv("RISK_SCORE_EMIT_DELTA", "10"))
RISK_TRACK_TIMEOUT_SECONDS = float(os.getenv("RISK_TRACK_TIMEOUT_SECONDS", "60"))
RISK_CONFIG_REFRESH_SECONDS = float(os.getenv("RISK_CONFIG_REFRESH_SECONDS", "300"))

# ── Evidence Capture (Phase 11) ────────────────────────────────
EVIDENCE_ENABLED = os.getenv("EVIDENCE_ENABLED", "true").lower() == "true"
EVIDENCE_PRE_SECONDS = float(os.getenv("EVIDENCE_PRE_SECONDS", "5"))
EVIDENCE_POST_SECONDS = float(os.getenv("EVIDENCE_POST_SECONDS", "5"))
# Ring buffer keeps a bounded set of recent frames so the clearest still can be
# selected when Node binds an incident or requests alert evidence.
EVIDENCE_RING_BUFFER_MAX = max(
    int(os.getenv("EVIDENCE_RING_BUFFER_MAX", "0")) or 0,
    int(FRAME_SAMPLE_FPS * (EVIDENCE_PRE_SECONDS + EVIDENCE_POST_SECONDS)),
)
EVIDENCE_MIME_SNAPSHOT = os.getenv("EVIDENCE_MIME_SNAPSHOT", "image/jpeg")

# ── ANPR Pipeline (Phase 12) ─────────────────────────────────
ANPR_ENABLED = os.getenv("ANPR_ENABLED", "true").lower() == "true"
# Dedicated plate-detection weights. If not present, the detector falls back to a
# documented plate-region heuristic (bottom-center of the vehicle bbox) — no large
# weights committed to the repo.
ANPR_MODEL_PATH = os.getenv("ANPR_MODEL_PATH", "license_plate_detector.pt")
ANPR_DETECTION_CONFIDENCE = float(os.getenv("ANPR_DETECTION_CONFIDENCE", "0.45"))
ANPR_MIN_OCR_CONFIDENCE = float(os.getenv("ANPR_MIN_OCR_CONFIDENCE", "0.60"))
ANPR_CONFIRM_READS = int(os.getenv("ANPR_CONFIRM_READS", "2"))
# Consensus: highest-confidence normalized text wins; ties broken by read count.
ANPR_PROCESS_EVERY_N_FRAMES = int(os.getenv("ANPR_PROCESS_EVERY_N_FRAMES", "2"))
# Minimum plate bbox side length (pixels) before a crop is attempted.
ANPR_MIN_PLATE_SIZE = int(os.getenv("ANPR_MIN_PLATE_SIZE", "20"))
ANPR_TRACK_TIMEOUT_SECONDS = float(os.getenv("ANPR_TRACK_TIMEOUT_SECONDS", "60"))
# When two vehicle tracks in the same frame yield plate regions that overlap
# more than this IoU, they are treated as the same physical plate (e.g. the
# same vehicle double-classified as car+truck by the detector) and the second
# evaluation is suppressed.
ANPR_DUP_IOU_THRESHOLD = float(os.getenv("ANPR_DUP_IOU_THRESHOLD", "0.5"))
ANPR_EARLY_ACCEPT_CONFIDENCE = float(os.getenv("ANPR_EARLY_ACCEPT_CONFIDENCE", "0.90"))
ANPR_EARLY_ACCEPT_QUALITY = float(os.getenv("ANPR_EARLY_ACCEPT_QUALITY", "0.65"))
ANPR_CONSENSUS_WINDOW_SECONDS = max(0.1, float(os.getenv("ANPR_CONSENSUS_WINDOW_SECONDS", "2")))
ANPR_PLATE_DEDUP_SECONDS = max(0.0, float(os.getenv("ANPR_PLATE_DEDUP_SECONDS", "30")))
ANPR_QUALITY_MIN_SHARPNESS = max(0.0, float(os.getenv("ANPR_QUALITY_MIN_SHARPNESS", "15")))
ANPR_QUALITY_MIN_CONTRAST = max(0.0, float(os.getenv("ANPR_QUALITY_MIN_CONTRAST", "8")))

# ── Face Detection Pipeline (Phase 12) ───────────────────────
FACE_DETECTION_ENABLED = os.getenv("FACE_DETECTION_ENABLED", "true").lower() == "true"
# OpenCV FaceDetectorYN (YuNet) — DETECTION ONLY (boxes + landmarks), never
# identity (we do NOT use FaceRecognizerSF). OpenCV 5 removed the legacy Haar
# CascadeClassifier, so this is the supported detector. The .onnx is sourced
# from WEIGHTS_DIR and resolved the same way as ANPR_MODEL_PATH.
FACE_MODEL_PATH = os.getenv("FACE_MODEL_PATH", "face_detection_yunet_2023mar.onnx")
FACE_DETECTION_CONFIDENCE = float(os.getenv("FACE_DETECTION_CONFIDENCE", "0.50"))
FACE_CONFIRM_FRAMES = int(os.getenv("FACE_CONFIRM_FRAMES", "2"))
FACE_PROCESS_EVERY_N_FRAMES = int(os.getenv("FACE_PROCESS_EVERY_N_FRAMES", "2"))
FACE_MIN_SIZE = int(os.getenv("FACE_MIN_SIZE", "30"))
FACE_TRACK_TIMEOUT_SECONDS = float(os.getenv("FACE_TRACK_TIMEOUT_SECONDS", "60"))
# Capture a cropped face image as attached evidence whenever a face observation
# is created. Metadata is POSTed to Node exactly like SNAPSHOT evidence; the
# crop is saved under FACE_DIR on the shared storage volume.
FACE_EVIDENCE_ENABLED = os.getenv("FACE_EVIDENCE_ENABLED", "true").lower() == "true"
FACE_MAX_EVIDENCE_PER_TRACK = min(3, max(1, int(os.getenv("FACE_MAX_EVIDENCE_PER_TRACK", "3"))))
FACE_QUALITY_IMPROVEMENT = max(0.01, float(os.getenv("FACE_QUALITY_IMPROVEMENT", "0.10")))
FACE_QUALITY_MIN_SHARPNESS = max(0.0, float(os.getenv("FACE_QUALITY_MIN_SHARPNESS", "15")))
FACE_QUALITY_MIN_BRIGHTNESS = float(os.getenv("FACE_QUALITY_MIN_BRIGHTNESS", "25"))
FACE_QUALITY_MAX_BRIGHTNESS = float(os.getenv("FACE_QUALITY_MAX_BRIGHTNESS", "235"))

# Visibility diagnostics are independent of detection confidence and threat risk.
# Calibrate sharpness/exposure thresholds for each installation; these defaults
# identify plainly unusable images, not a universal accuracy guarantee.
CAMERA_QUALITY_ENABLED = os.getenv("CAMERA_QUALITY_ENABLED", "true").lower() == "true"
CAMERA_QUALITY_SAMPLE_SECONDS = max(0.1, float(os.getenv("CAMERA_QUALITY_SAMPLE_SECONDS", "1")))
CAMERA_QUALITY_BLUR_THRESHOLD = max(0.0, float(os.getenv("CAMERA_QUALITY_BLUR_THRESHOLD", "40")))
CAMERA_QUALITY_DARK_THRESHOLD = float(os.getenv("CAMERA_QUALITY_DARK_THRESHOLD", "40"))
CAMERA_QUALITY_BRIGHT_THRESHOLD = float(os.getenv("CAMERA_QUALITY_BRIGHT_THRESHOLD", "220"))
CAMERA_QUALITY_EXPOSURE_FRACTION = float(os.getenv("CAMERA_QUALITY_EXPOSURE_FRACTION", "0.65"))

# ── Live Streaming (Phase 13) ─────────────────────────────────
# Timeouts / staleness / reconnect for live camera sources. A dead camera must
# fail visibly (not hang) and enter reconnect logic with bounded backoff.
STREAM_CONNECT_TIMEOUT_SECONDS = float(os.getenv("STREAM_CONNECT_TIMEOUT_SECONDS", "10"))
STREAM_READ_TIMEOUT_SECONDS = float(os.getenv("STREAM_READ_TIMEOUT_SECONDS", "8"))
STREAM_STALE_SECONDS = float(os.getenv("STREAM_STALE_SECONDS", "5"))
# Low-latency RTSP ingest: FFmpeg's default input buffering (analyzeduration
# ~5s, probesize ~5MB, reorder_queue_size ~512 packets) makes cap.read() return
# frames minutes behind the live edge once the app reads slower than the source
# produces. These options keep the read tail close to the live stream. They are
# FFmpeg AVFormat-level options passed through OpenCV's
# OPENCV_FFMPEG_CAPTURE_OPTIONS; tunable per environment.
STREAM_FFMPEG_LOW_LATENCY = os.getenv("STREAM_FFMPEG_LOW_LATENCY", "true").lower() == "true"
STREAM_FFMPEG_ANALYZEDURATION = os.getenv("STREAM_FFMPEG_ANALYZEDURATION", "500000")
STREAM_FFMPEG_PROBESIZE = os.getenv("STREAM_FFMPEG_PROBESIZE", "500000")
STREAM_FFMPEG_REORDER_QUEUE = os.getenv("STREAM_FFMPEG_REORDER_QUEUE", "0")
# Number of consecutive invalid frame reads tolerated before the live loop
# treats the source as disconnected. A single dropped frame must NOT tear down
# the stream session (which resets all per-track context/risk state) — only
# sustained read failures justify a full close + reconnect.
STREAM_MAX_CONSECUTIVE_READ_FAILURES = int(os.getenv("STREAM_MAX_CONSECUTIVE_READ_FAILURES", "5"))
# A burst of immediate False reads from OpenCV/FFmpeg is not enough to prove an
# RTSP session is dead. Require both the failure count above and this real-time
# gap since the last decoded frame before rebuilding the reader/session.
STREAM_NO_FRAME_TOLERANCE_SECONDS = max(
    0.1, float(os.getenv("STREAM_NO_FRAME_TOLERANCE_SECONDS", "5"))
)
STREAM_RECONNECT_BASE_SECONDS = float(os.getenv("STREAM_RECONNECT_BASE_SECONDS", "1"))
STREAM_RECONNECT_MAX_SECONDS = float(os.getenv("STREAM_RECONNECT_MAX_SECONDS", "15"))
STREAM_RECONNECT_STABLE_SECONDS = max(
    1.0, float(os.getenv("STREAM_RECONNECT_STABLE_SECONDS", "5"))
)
# Heartbeat interval for the Redis runtime-state writer.
STREAM_HEARTBEAT_SECONDS = float(os.getenv("STREAM_HEARTBEAT_SECONDS", "5"))
# How often the live pipeline re-fetches the camera source config (RTSP URL,
# transport, rotation, target FPS, enabled) from Node so website changes are
# picked up and the source re-connects without a manual restart.
SOURCE_CONFIG_REFRESH_SECONDS = float(os.getenv("SOURCE_CONFIG_REFRESH_SECONDS", "10"))

# ── Browser Preview (Phase 13) ───────────────────────────────
PREVIEW_ENABLED = os.getenv("PREVIEW_ENABLED", "true").lower() == "true"
PREVIEW_FPS = int(os.getenv("PREVIEW_FPS", "10"))
PREVIEW_WIDTH = int(os.getenv("PREVIEW_WIDTH", "1280"))
PREVIEW_JPEG_QUALITY = int(os.getenv("PREVIEW_JPEG_QUALITY", "80"))
# Label applied to the python-side raw/annotated preview for source-type gating.
PREVIEW_ANNOTATED = os.getenv("PREVIEW_ANNOTATED", "true").lower() == "true"

# ── Redis runtime state (Phase 13) ────────────────────────────
# Ephemeral only — camera online/offline, heartbeat, session id, last frame.
# MySQL remains authoritative for all permanent records.
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() == "true"
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
REDIS_KEY_PREFIX = os.getenv("REDIS_KEY_PREFIX", "ibvap")
REDIS_CAMERA_STATUS_TTL_SECONDS = int(os.getenv("REDIS_CAMERA_STATUS_TTL_SECONDS", "15"))

# ── Paths ────────────────────────────────────────────────────
MODEL_DIR = BASE_DIR / "models"
WEIGHTS_DIR = MODEL_DIR / "weights"
EVIDENCE_DIR = Path(os.getenv("EVIDENCE_BASE_PATH", BASE_DIR.parent / "storage")).resolve()
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_PATH", EVIDENCE_DIR / "snapshots")).resolve()
FACE_DIR = Path(os.getenv("FACE_PATH", EVIDENCE_DIR / "faces")).resolve()
SAMPLES_DIR = BASE_DIR / "samples"
OUTPUTS_DIR = BASE_DIR / "outputs"
