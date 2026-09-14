import time
from enum import Enum
from threading import Lock

from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("stream_health")


class StreamStatus(str, Enum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    CONNECTING = "CONNECTING"
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    RECONNECTING = "RECONNECTING"
    OFFLINE = "OFFLINE"
    EOF = "EOF"
    ERROR = "ERROR"
    STOPPED = "STOPPED"


class StreamHealth:
    """Tracks video source health metrics."""

    def __init__(self):
        self._lock = Lock()
        self._status: StreamStatus = StreamStatus.NOT_CONFIGURED
        self._source_type: str | None = None
        self._source_fps: float = 0.0
        self._frames_received: int = 0
        self._frames_processed: int = 0
        self._frames_dropped: int = 0
        self._read_errors: int = 0
        self._last_frame_timestamp: str | None = None
        self._processing_fps: float | None = None
        self._average_latency_ms: float | None = None
        self._error_message: str | None = None
        self._start_time: float = time.time()
        self._latency_sum: float = 0.0
        self._latency_count: int = 0
        self._stream_session_id: str | None = None
        self._reconnect_attempts: int = 0
        self._last_heartbeat_at: str | None = None
        self._last_frame_monotonic: float = 0.0
        self._decoded_fps: float = 0.0
        self._consecutive_read_failures: int = 0
        self._dropped_stale_frames: int = 0
        self._reconnect_count: int = 0
        self._connection_started_at: str | None = None
        self._inference_latency_sum: float = 0.0
        self._inference_latency_count: int = 0
        self._average_inference_ms: float | None = None
        self._frame_age_before_ai_sum: float = 0.0
        self._frame_age_after_ai_sum: float = 0.0
        self._frame_age_count: int = 0
        self._average_frame_age_before_ai_ms: float | None = None
        self._average_frame_age_after_ai_ms: float | None = None
        self._preview_metrics: dict = {}

    def set_status(self, status: StreamStatus, error: str | None = None) -> None:
        with self._lock:
            self._status = status
            self._error_message = error
            if status == StreamStatus.NOT_CONFIGURED:
                logger.info("Stream status: NOT_CONFIGURED")
            elif status == StreamStatus.ONLINE:
                logger.info("Stream status: ONLINE")
            elif status == StreamStatus.EOF:
                logger.info("Stream status: EOF")
            elif status == StreamStatus.CONNECTING:
                logger.info("Stream status: CONNECTING")
            elif status == StreamStatus.DEGRADED:
                logger.warning("Stream status: DEGRADED — %s", error or "stale/no fresh frames")
            elif status == StreamStatus.RECONNECTING:
                logger.warning("Stream status: RECONNECTING — %s", error or "connection lost")
            elif status == StreamStatus.OFFLINE:
                logger.warning("Stream status: OFFLINE — %s", error or "no connection")
            elif status == StreamStatus.ERROR:
                logger.error("Stream status: ERROR — %s", error)

    def set_source_info(self, source_type: str, fps: float) -> None:
        with self._lock:
            self._source_type = source_type
            self._source_fps = fps

    def set_session(self, stream_session_id: str | None) -> None:
        with self._lock:
            self._stream_session_id = stream_session_id
            if stream_session_id:
                self._connection_started_at = utc_iso()

    def record_reconnect(self) -> None:
        with self._lock:
            self._reconnect_count += 1

    def set_reconnect_attempts(self, attempts: int) -> None:
        with self._lock:
            self._reconnect_attempts = attempts

    def record_heartbeat(self) -> None:
        with self._lock:
            self._last_heartbeat_at = utc_iso()

    def record_frame_received(self) -> None:
        with self._lock:
            self._frames_received += 1
            self._last_frame_timestamp = utc_iso()
            self._last_frame_monotonic = time.monotonic()

    def update_ingest(
        self,
        *,
        received_delta: int = 0,
        dropped_delta: int = 0,
        read_error_delta: int = 0,
        decoded_fps: float = 0.0,
        consecutive_failures: int = 0,
        last_frame_timestamp: str | None = None,
        last_frame_monotonic: float = 0.0,
        failure_reason: str | None = None,
    ) -> None:
        """Merge one producer snapshot using deltas for cumulative counters."""
        with self._lock:
            self._frames_received += max(0, int(received_delta))
            self._frames_dropped += max(0, int(dropped_delta))
            self._dropped_stale_frames += max(0, int(dropped_delta))
            self._read_errors += max(0, int(read_error_delta))
            self._decoded_fps = max(0.0, float(decoded_fps or 0.0))
            self._consecutive_read_failures = max(0, int(consecutive_failures))
            if last_frame_timestamp:
                self._last_frame_timestamp = last_frame_timestamp
            if last_frame_monotonic > 0:
                self._last_frame_monotonic = last_frame_monotonic
            if failure_reason:
                self._error_message = failure_reason

    def record_frame_processed(
        self,
        latency_ms: float,
        inference_ms: float | None = None,
        frame_age_before_ai_ms: float | None = None,
        frame_age_after_ai_ms: float | None = None,
    ) -> None:
        with self._lock:
            self._frames_processed += 1
            self._latency_sum += latency_ms
            self._latency_count += 1
            self._average_latency_ms = self._latency_sum / self._latency_count

            if inference_ms is not None:
                self._inference_latency_sum += max(0.0, inference_ms)
                self._inference_latency_count += 1
                self._average_inference_ms = (
                    self._inference_latency_sum / self._inference_latency_count
                )
            if frame_age_before_ai_ms is not None and frame_age_after_ai_ms is not None:
                self._frame_age_before_ai_sum += max(0.0, frame_age_before_ai_ms)
                self._frame_age_after_ai_sum += max(0.0, frame_age_after_ai_ms)
                self._frame_age_count += 1
                self._average_frame_age_before_ai_ms = (
                    self._frame_age_before_ai_sum / self._frame_age_count
                )
                self._average_frame_age_after_ai_ms = (
                    self._frame_age_after_ai_sum / self._frame_age_count
                )

            elapsed = time.time() - self._start_time
            if elapsed > 0:
                self._processing_fps = self._frames_processed / elapsed

    def record_frame_dropped(self) -> None:
        with self._lock:
            self._frames_dropped += 1

    def record_read_error(self, message: str | None = None) -> None:
        with self._lock:
            self._read_errors += 1
            if message:
                self._error_message = message

    def update_preview_metrics(self, metrics: dict | None) -> None:
        with self._lock:
            self._preview_metrics = dict(metrics or {})

    def get_report(self) -> dict:
        with self._lock:
            last_frame_age_ms = (
                max(0.0, time.monotonic() - self._last_frame_monotonic) * 1000.0
                if self._last_frame_monotonic > 0
                else None
            )
            return {
                "configured": self._status not in (StreamStatus.NOT_CONFIGURED,),
                "status": self._status.value,
                "sourceType": self._source_type,
                "fps": self._source_fps if self._source_fps > 0 else None,
                "framesReceived": self._frames_received,
                "framesProcessed": self._frames_processed,
                "framesDropped": self._frames_dropped,
                "readErrors": self._read_errors,
                "lastFrameTimestamp": self._last_frame_timestamp,
                "processingFps": round(self._processing_fps, 2) if self._processing_fps else None,
                "averageLatencyMs": round(self._average_latency_ms, 2) if self._average_latency_ms else None,
                "errorMessage": self._error_message,
                "streamSessionId": self._stream_session_id,
                "reconnectAttempts": self._reconnect_attempts,
                "lastHeartbeatAt": self._last_heartbeat_at,
                "lastFrameAgeMs": round(last_frame_age_ms, 2) if last_frame_age_ms is not None else None,
                "decodedFps": round(self._decoded_fps, 2) if self._decoded_fps else None,
                "droppedStaleFrames": self._dropped_stale_frames,
                "consecutiveReadFailures": self._consecutive_read_failures,
                "reconnectCount": self._reconnect_count,
                "connectionStartedAt": self._connection_started_at,
                "averageInferenceMs": round(self._average_inference_ms, 2) if self._average_inference_ms is not None else None,
                "averageFrameAgeBeforeAiMs": round(self._average_frame_age_before_ai_ms, 2) if self._average_frame_age_before_ai_ms is not None else None,
                "averageFrameAgeAfterAiMs": round(self._average_frame_age_after_ai_ms, 2) if self._average_frame_age_after_ai_ms is not None else None,
                **self._preview_metrics,
            }

    def reset(self) -> None:
        with self._lock:
            self._status = StreamStatus.NOT_CONFIGURED
            self._source_type = None
            self._source_fps = 0.0
            self._frames_received = 0
            self._frames_processed = 0
            self._frames_dropped = 0
            self._read_errors = 0
            self._last_frame_timestamp = None
            self._processing_fps = None
            self._average_latency_ms = None
            self._error_message = None
            self._start_time = time.time()
            self._latency_sum = 0.0
            self._latency_count = 0
            self._stream_session_id = None
            self._reconnect_attempts = 0
            self._last_heartbeat_at = None
            self._last_frame_monotonic = 0.0
            self._decoded_fps = 0.0
            self._consecutive_read_failures = 0
            self._dropped_stale_frames = 0
            self._reconnect_count = 0
            self._connection_started_at = None
            self._inference_latency_sum = 0.0
            self._inference_latency_count = 0
            self._average_inference_ms = None
            self._frame_age_before_ai_sum = 0.0
            self._frame_age_after_ai_sum = 0.0
            self._frame_age_count = 0
            self._average_frame_age_before_ai_ms = None
            self._average_frame_age_after_ai_ms = None
            self._preview_metrics = {}
