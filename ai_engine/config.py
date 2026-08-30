import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

APP_ENV = os.getenv("APP_ENV", "development")
AI_ENGINE_HOST = os.getenv("AI_ENGINE_HOST", "0.0.0.0")
AI_ENGINE_PORT = int(os.getenv("AI_ENGINE_PORT", "8000"))
LOG_LEVEL = os.getenv("AI_ENGINE_LOG_LEVEL", "INFO")

MODEL_DIR = BASE_DIR / "models"
WEIGHTS_DIR = MODEL_DIR / "weights"
EVIDENCE_DIR = Path(os.getenv("EVIDENCE_BASE_PATH", BASE_DIR.parent / "storage")).resolve()
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_PATH", EVIDENCE_DIR / "snapshots")).resolve()
CLIP_DIR = Path(os.getenv("CLIP_PATH", EVIDENCE_DIR / "clips")).resolve()

# Keep configuration externalized from source code.
# Actual camera, model, and security settings will be added later.
