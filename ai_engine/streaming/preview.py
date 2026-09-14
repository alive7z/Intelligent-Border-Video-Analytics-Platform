"""Browser-compatible preview support: latest-frame store + MJPEG multipart.

A single (shared) frame store holds ONLY the most recent annotated frame per
camera per session — never an unbounded history. Slow browsers read the latest
frame (latest-frame semantics) rather than blocking AI inference, and multiple
preview clients share the one decoder/frame store.
"""
import threading
import time

import cv2
import numpy as np

from config import (
    PREVIEW_FPS,
    PREVIEW_JPEG_QUALITY,
    PREVIEW_WIDTH,
)
from utils.logger import get_logger

logger = get_logger("preview")

_JPEG_HEADER = b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n"


class LatestFrameStore:
    """Holds the single most recent annotated frame for a camera (latest-frame)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._encode_lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._captured_at: float = 0.0
        self._captured_monotonic: float = 0.0
        self._version: int = 0
        self._jpeg: bytes | None = None
        self._jpeg_version: int = 0
        self._jpeg_ready_monotonic: float = 0.0
        self._jpeg_encode_total_ms: float = 0.0
        self._jpeg_encode_count: int = 0
        self._jpeg_ready_age_total_ms: float = 0.0
        self._preview_send_times: list[float] = []
        self._frames_sent: int = 0
        self._preview_send_age_total_ms: float = 0.0
        self._active_clients: int = 0

    def set(self, frame: np.ndarray, captured_monotonic: float | None = None) -> None:
        with self._lock:
            self._frame = frame
            self._captured_at = time.time()
            self._captured_monotonic = captured_monotonic or time.monotonic()
            self._version += 1
            self._jpeg = None

    def get(self) -> tuple[np.ndarray | None, float]:
        with self._lock:
            return self._frame, self._captured_at

    def clear(self) -> None:
        with self._lock:
            self._frame = None
            self._captured_at = 0.0
            self._captured_monotonic = 0.0
            self._jpeg = None

    def has_frame(self) -> bool:
        with self._lock:
            return self._frame is not None

    def get_encoded(self) -> tuple[bytes, int]:
        """Return the current JPEG, encoding each frame version at most once."""
        with self._encode_lock:
            with self._lock:
                if self._frame is None:
                    return b"", 0
                version = self._version
                if self._jpeg is not None and self._jpeg_version == version:
                    return self._jpeg, version
                frame = self._frame

            started = time.monotonic()
            jpeg = encode_jpeg(frame)
            encode_ms = (time.monotonic() - started) * 1000.0
            if not jpeg:
                return b"", version

            with self._lock:
                # If AI published a newer frame during encoding, do not replace
                # its cache with the older JPEG; the next call encodes latest.
                if self._version == version:
                    self._jpeg = jpeg
                    self._jpeg_version = version
                    self._jpeg_ready_monotonic = time.monotonic()
                    self._jpeg_encode_total_ms += encode_ms
                    self._jpeg_ready_age_total_ms += max(
                        0.0,
                        (self._jpeg_ready_monotonic - self._captured_monotonic) * 1000.0,
                    )
                    self._jpeg_encode_count += 1
            return jpeg, version

    def client_connected(self) -> None:
        with self._lock:
            self._active_clients += 1

    def client_disconnected(self) -> None:
        with self._lock:
            self._active_clients = max(0, self._active_clients - 1)

    def record_sent(self) -> None:
        with self._lock:
            now = time.monotonic()
            self._frames_sent += 1
            if self._captured_monotonic > 0:
                self._preview_send_age_total_ms += max(
                    0.0, (now - self._captured_monotonic) * 1000.0
                )
            self._preview_send_times.append(now)
            cutoff = now - 5.0
            while self._preview_send_times and self._preview_send_times[0] < cutoff:
                self._preview_send_times.pop(0)

    def get_stats(self) -> dict:
        with self._lock:
            now = time.monotonic()
            cutoff = now - 5.0
            while self._preview_send_times and self._preview_send_times[0] < cutoff:
                self._preview_send_times.pop(0)
            preview_fps = 0.0
            if len(self._preview_send_times) >= 2:
                span = self._preview_send_times[-1] - self._preview_send_times[0]
                if span > 0:
                    preview_fps = (len(self._preview_send_times) - 1) / span
            if self._active_clients > 0:
                # record_sent is aggregate across viewers; report the
                # approximate per-viewer delivery rate for a useful MJPEG FPS.
                preview_fps /= self._active_clients
            frame_age_ms = (
                max(0.0, now - self._captured_monotonic) * 1000.0
                if self._captured_monotonic > 0
                else None
            )
            return {
                "previewFps": round(preview_fps, 2),
                "previewClients": self._active_clients,
                "framesPreviewSent": self._frames_sent,
                "framesJpegEncoded": self._jpeg_encode_count,
                "averageJpegEncodeMs": round(
                    self._jpeg_encode_total_ms / self._jpeg_encode_count, 2
                ) if self._jpeg_encode_count else None,
                "averageJpegReadyAgeMs": round(
                    self._jpeg_ready_age_total_ms / self._jpeg_encode_count, 2
                ) if self._jpeg_encode_count else None,
                "averagePreviewSendAgeMs": round(
                    self._preview_send_age_total_ms / self._frames_sent, 2
                ) if self._frames_sent else None,
                "previewFrameAgeMs": round(frame_age_ms, 2) if frame_age_ms is not None else None,
            }


def prepare_preview_frame(frame: np.ndarray) -> np.ndarray:
    """Downscale a frame for preview delivery (keeps aspect ratio)."""
    h, w = frame.shape[:2]
    if PREVIEW_WIDTH > 0 and w > PREVIEW_WIDTH:
        scale = PREVIEW_WIDTH / float(w)
        new_w = PREVIEW_WIDTH
        new_h = int(round(h * scale))
        return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return frame


def encode_jpeg(frame: np.ndarray) -> bytes:
    """Encode a frame to JPEG bytes (quality from config). Returns b"" on failure."""
    img = prepare_preview_frame(frame)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), PREVIEW_JPEG_QUALITY])
    if not ok:
        return b""
    return buf.tobytes()


def iter_mjpeg(store: LatestFrameStore,
               min_interval: float | None = None):
    """Yield MJPEG multipart body chunks from a LatestFrameStore (latest-frame).

    `min_interval` (seconds) throttles delivery; if None the caller's loop paces
    it. This is a generator for FastAPI StreamingResponse; no unbounded queue.
    """
    last_sent: float = 0.0
    last_version: int = 0
    last_keepalive: float = 0.0
    min_interval = min_interval if min_interval is not None else (1.0 / PREVIEW_FPS if PREVIEW_FPS > 0 else 0.0)
    store.client_connected()
    try:
        while True:
            now = time.monotonic()
            if (now - last_sent) >= min_interval:
                jpeg, version = store.get_encoded()
                # Send each new annotated frame once. During a source outage,
                # repeat the explicitly stale cached JPEG only once per second
                # to keep the multipart connection attached for auto-recovery.
                should_send = version != last_version or (now - last_keepalive) >= 1.0
                if jpeg and should_send:
                    store.record_sent()
                    last_sent = now
                    last_keepalive = now
                    last_version = version
                    yield _JPEG_HEADER % len(jpeg) + jpeg + b"\r\n"
            time.sleep(0.02)
    finally:
        store.client_disconnected()
