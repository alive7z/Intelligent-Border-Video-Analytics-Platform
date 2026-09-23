# IBVAP AI engine — Python + FastAPI + OpenCV/YOLO/ANPR/face detection.
# Build context is `./ai_engine`. Weights are never baked into the image:
# they are mounted read-only from ai_engine/models/weights at runtime.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_HOST=0.0.0.0 \
    HOME=/home/ibvap

# OpenCV/FFmpeg system libraries (cv2, frames, imagecodecs).
# FFmpeg is used by the live RTSP ingest path (cv2 backend).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
# Frozen, verified dependency set (Phase 4 snapshot). Do not upgrade.
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root runtime user (uid 10001 matches the backend user so the shared
# ./storage evidence volume is readable/writable by both).
RUN groupadd -g 10001 ibvap && useradd -u 10001 -g ibvap -m -s /bin/bash ibvap \
  && mkdir -p /app/outputs /app/models/weights /storage /home/ibvap/.EasyOCR/model \
  && chmod +x /app/docker-entrypoint.sh \
  && chown -R ibvap:ibvap /app /storage /home/ibvap

USER ibvap

# The FastAPI service entrypoint: `python main.py --serve` (matches the repo's
# documented production run; also honors --all-cameras/--camera-code overrides).
ENTRYPOINT ["/app/docker-entrypoint.sh"]

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=5).status==200 else 1)"
