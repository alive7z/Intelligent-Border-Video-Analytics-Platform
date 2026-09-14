"""Single-producer, latest-frame ingestion for live video sources.

The producer is the only caller of ``reader.read()`` for a camera session.  It
keeps one raw frame, replacing an unconsumed frame when decoding outruns AI.
This prevents the FFmpeg/OpenCV input buffer from becoming the pipeline queue.
"""
from dataclasses import dataclass
from collections import deque
import threading
import time

import numpy as np

from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("live_ingest")


@dataclass(frozen=True)
class DecodedFrame:
    sequence: int
    image: np.ndarray
    decoded_at: float
    decoded_monotonic: float


class LiveFrameProducer:
    """Continuously decode into a one-frame, thread-safe latest-frame slot."""

    def __init__(self, reader, source_id: str, failure_pause_seconds: float = 0.05):
        self._reader = reader
        self._source_id = source_id
        self._failure_pause = max(0.01, float(failure_pause_seconds))
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._started_monotonic: float = 0.0
        self._latest: DecodedFrame | None = None
        self._last_consumed_sequence = 0
        self._sequence = 0
        self._frames_received = 0
        self._frames_dropped = 0
        self._read_errors = 0
        self._consecutive_failures = 0
        self._last_frame_timestamp: str | None = None
        self._last_frame_monotonic = 0.0
        self._last_failure_reason: str | None = None
        self._recent_frame_times: deque[float] = deque()

    def start(self) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                raise RuntimeError(f"Live frame producer already running: {self._source_id}")
            self._stop_event.clear()
            self._started_monotonic = time.monotonic()
            self._thread = threading.Thread(
                target=self._run,
                daemon=True,
                name=f"rtsp-ingest-{self._source_id}",
            )
            self._thread.start()

    def _run(self) -> None:
        while not self._stop_event.is_set():
            ok, image = self._reader.read()
            now_mono = time.monotonic()
            if ok and image is not None:
                now_wall = time.time()
                with self._lock:
                    self._sequence += 1
                    if (
                        self._latest is not None
                        and self._latest.sequence > self._last_consumed_sequence
                    ):
                        self._frames_dropped += 1
                    self._latest = DecodedFrame(
                        sequence=self._sequence,
                        image=image,
                        decoded_at=now_wall,
                        decoded_monotonic=now_mono,
                    )
                    self._frames_received += 1
                    self._consecutive_failures = 0
                    self._last_failure_reason = None
                    self._last_frame_timestamp = utc_iso()
                    self._last_frame_monotonic = now_mono
                    self._recent_frame_times.append(now_mono)
                    self._prune_frame_times(now_mono)
                continue

            metadata = self._reader.get_metadata()
            with self._lock:
                self._read_errors += 1
                self._consecutive_failures = max(
                    self._consecutive_failures + 1,
                    int(metadata.get("consecutiveFailures") or 0),
                )
                self._last_failure_reason = metadata.get("lastFailureReason") or "no_frame"
            self._stop_event.wait(self._failure_pause)

    def _prune_frame_times(self, now_mono: float) -> None:
        cutoff = now_mono - 5.0
        while self._recent_frame_times and self._recent_frame_times[0] < cutoff:
            self._recent_frame_times.popleft()

    def get_latest(self, after_sequence: int = 0) -> DecodedFrame | None:
        """Return and mark consumed only a frame newer than ``after_sequence``."""
        with self._lock:
            if self._latest is None or self._latest.sequence <= after_sequence:
                return None
            self._last_consumed_sequence = self._latest.sequence
            return self._latest

    def get_stats(self) -> dict:
        with self._lock:
            now_mono = time.monotonic()
            self._prune_frame_times(now_mono)
            decoded_fps = 0.0
            if len(self._recent_frame_times) >= 2:
                span = self._recent_frame_times[-1] - self._recent_frame_times[0]
                if span > 0:
                    decoded_fps = (len(self._recent_frame_times) - 1) / span
            age_origin = self._last_frame_monotonic or self._started_monotonic
            last_age_ms = (
                max(0.0, now_mono - age_origin) * 1000.0
                if age_origin > 0
                else None
            )
            return {
                "framesReceived": self._frames_received,
                "droppedStaleFrames": self._frames_dropped,
                "readErrors": self._read_errors,
                "consecutiveFailures": self._consecutive_failures,
                "lastFrameTimestamp": self._last_frame_timestamp,
                "lastFrameMonotonic": self._last_frame_monotonic,
                "lastFrameAgeMs": round(last_age_ms, 2) if last_age_ms is not None else None,
                "lastFailureReason": self._last_failure_reason,
                "decodedFps": round(decoded_fps, 2),
                "latestSequence": self._sequence,
                "running": bool(self._thread and self._thread.is_alive()),
                "threadName": self._thread.name if self._thread else None,
            }

    def is_alive(self) -> bool:
        with self._lock:
            return bool(self._thread and self._thread.is_alive())

    def stop(self, close_reader: bool = True, timeout: float | None = None) -> bool:
        """Stop and join before another decoder is allowed to open."""
        self._stop_event.set()
        with self._lock:
            thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            if timeout is None:
                metadata = self._reader.get_metadata()
                timeout = min(61.0, max(1.0, float(metadata.get("readTimeoutSeconds") or 10.0) + 1.0))
            thread.join(timeout=timeout)
        stopped = thread is None or not thread.is_alive()
        # OpenCV/FFmpeg capture methods are not safe to release concurrently
        # with cap.read() on every platform. The producer owns reads, so release
        # only after it exits (or after read() enforces its bounded timeout).
        if stopped and close_reader:
            try:
                if self._reader.close() is False:
                    stopped = False
            except Exception:  # noqa: BLE001 - shutdown is best effort
                pass
        if not stopped:
            logger.error("Live frame producer did not stop cleanly: %s", self._source_id)
        return stopped
