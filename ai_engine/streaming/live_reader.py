"""Live video source for transient streams (RTSP / HTTP / MJPEG / phone).

Implementation uses OpenCV's VideoCapture (which is backed by FFmpeg for RTSP/MJPEG
on the installed build). Reads are validated (non-null, non-zero dims, sane
timestamps) and guarded by connection/read timeouts so a dead or hanging camera
fails visibly instead of blocking forever.
"""
import os
import threading
import time
from contextlib import contextmanager

import cv2
import numpy as np

from config import (
    STREAM_FFMPEG_ANALYZEDURATION,
    STREAM_FFMPEG_LOW_LATENCY,
    STREAM_FFMPEG_PROBESIZE,
    STREAM_FFMPEG_REORDER_QUEUE,
    STREAM_MAX_CONSECUTIVE_READ_FAILURES,
)
from streaming.video_source import SourceType, VideoSource
from utils.logger import get_logger

logger = get_logger("live_reader")

_native_stderr_lock = threading.Lock()
_capture_open_lock = threading.Lock()
_native_stderr_users = 0
_saved_native_stderr = None


@contextmanager
def _suppress_native_stderr():
    """Prevent native video backends from echoing private source URLs."""
    global _native_stderr_users, _saved_native_stderr
    with _native_stderr_lock:
        if _native_stderr_users == 0:
            _saved_native_stderr = os.dup(2)
            devnull = os.open(os.devnull, os.O_WRONLY)
            os.dup2(devnull, 2)
            os.close(devnull)
        _native_stderr_users += 1
    try:
        # Never hold a process-wide mutex over a blocking camera read.
        yield
    finally:
        with _native_stderr_lock:
            _native_stderr_users -= 1
            if _native_stderr_users == 0:
                os.dup2(_saved_native_stderr, 2)
                os.close(_saved_native_stderr)
                _saved_native_stderr = None


class LiveVideoSource(VideoSource):
    """A live source identified by camera code + a stream URL.

    `source_type` maps a MOBILE classification to its transport protocol when
    available (MOBILE + MJPEG -> MJPEG), otherwise falls back to the requested
    type. Reconnect/session logic lives in the caller via ReconnectController but
    this class tracks its own open state and per-read timestamps.
    """

    def __init__(
        self,
        stream_url: str,
        source_id: str = "LIVE",
        source_type: SourceType = SourceType.HTTP,
        protocol: str | None = None,
        connect_timeout_seconds: float = 10.0,
        read_timeout_seconds: float = 10.0,
        share_behind: float = 0.0,
    ):
        self._stream_url = stream_url
        self._source_id = source_id
        self._requested_type = source_type
        self._protocol = (protocol or "").upper()
        self._source_type = self._resolve_type()
        self._connect_timeout = connect_timeout_seconds
        self._read_timeout = read_timeout_seconds
        self._share_behind = share_behind
        self._cap: cv2.VideoCapture | None = None
        self._is_open = False
        self._fps: float = 0.0
        self._width: int = 0
        self._height: int = 0
        self._total_frames_read: int = 0
        self._last_read_monotonic: float = 0.0
        self._last_read_at_utc: str | None = None
        self._consecutive_failures: int = 0
        self._last_failure_reason: str | None = None
        self._last_failure_log_monotonic: float = 0.0
        self._pending_read: threading.Thread | None = None
        self._pending_open: threading.Thread | None = None

    def _resolve_type(self) -> SourceType:
        # MOBILE is a classification; its actual transport is the protocol.
        if self._requested_type == SourceType.MOBILE:
            if self._protocol == "MJPEG":
                return SourceType.MJPEG
            if self._protocol == "RTSP":
                return SourceType.RTSP
            if self._protocol == "HTTP":
                return SourceType.HTTP
            return SourceType.HTTP  # default for phone IP-camera transport
        return self._requested_type

    @property
    def source_type(self) -> SourceType:
        return self._source_type

    @property
    def source_id(self) -> str:
        return self._source_id

    @property
    def stream_url(self) -> str:
        return self._stream_url

    @property
    def consecutive_failures(self) -> int:
        return self._consecutive_failures

    @property
    def last_read_at(self) -> str | None:
        return self._last_read_at_utc

    def seconds_since_last_frame(self) -> float:
        if self._last_read_monotonic <= 0:
            return 0.0
        return max(0.0, time.monotonic() - self._last_read_monotonic)

    def capture_is_open(self) -> bool:
        if not self._is_open or self._cap is None:
            return False
        try:
            return bool(self._cap.isOpened())
        except Exception:
            return False

    def _capture_options(self) -> str | None:
        """FFmpeg AVFormat options for low-latency live RTSP ingest.

        OpenCV reads OPENCV_FFMPEG_CAPTURE_OPTIONS as `key;value` pairs separated
        by `|`, applied at avformat_open_input time. Keep rtsp_transport=tcp
        (more reliable on the phone stream) and add input-buffer reduction so
        cap.read() tracks the live edge instead of a growing backlog.
        """
        if self._source_type != SourceType.RTSP:
            return None
        if not STREAM_FFMPEG_LOW_LATENCY:
            return "rtsp_transport;tcp"
        return (
            "rtsp_transport;tcp"
            f"|analyzeduration;{int(STREAM_FFMPEG_ANALYZEDURATION)}"
            f"|probesize;{int(STREAM_FFMPEG_PROBESIZE)}"
            f"|reorder_queue_size;{int(STREAM_FFMPEG_REORDER_QUEUE)}"
            "|fflags;nobuffer"
            "|flags;low_delay"
        )

    def open(self) -> None:
        if self._pending_read is not None and self._pending_read.is_alive():
            raise IOError(f"Previous decoder read still active: {self._source_id}")
        if self._pending_open is not None and self._pending_open is not threading.current_thread() and self._pending_open.is_alive():
            raise IOError(f"Previous decoder open still active: {self._source_id}")
        if self._cap is not None:
            self.close()
        # OpenCV/FFmpeg can write the full URL (including credentials) directly
        # to native stderr on failure. Suppress that output and emit only the
        # safe camera source_id through the application logger below.
        with _capture_open_lock, _suppress_native_stderr():
            capture_params = []
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                capture_params.extend([
                    cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                    max(1, int(self._connect_timeout * 1000)),
                ])
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                capture_params.extend([
                    cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                    max(1, int(self._read_timeout * 1000)),
                ])

            # RTSP transport must be selected when FFmpeg opens the capture;
            # setting CAP_PROP_RTSP_TRANSPORT afterwards is too late. The phone
            # stream used by CAM-01 is stable over TCP but intermittently returns
            # empty reads with OpenCV's default transport selection.
            previous_ffmpeg_options = os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS")
            cap = None
            try:
                ffmpeg_options = self._capture_options()
                if ffmpeg_options is not None:
                    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = ffmpeg_options
                try:
                    if self._source_type == SourceType.RTSP or ffmpeg_options is not None:
                        cap = cv2.VideoCapture(
                            self._stream_url,
                            cv2.CAP_FFMPEG,
                            capture_params,
                        )
                    else:
                        cap = cv2.VideoCapture(self._stream_url)

                    # Non-RTSP URLs first use OpenCV's preferred backend. If
                    # that backend cannot open them, retry once with FFmpeg.
                    # RTSP already uses FFmpeg and is retried by the bounded
                    # outer reconnect loop instead of opening twice here.
                    if (
                        self._source_type != SourceType.RTSP
                        and cap is not None
                        and not cap.isOpened()
                    ):
                        cap.release()
                        cap = cv2.VideoCapture(
                            self._stream_url,
                            cv2.CAP_FFMPEG,
                            capture_params,
                        )
                except Exception:
                    if cap is not None:
                        cap.release()
                    cap = None
            finally:
                if previous_ffmpeg_options is None:
                    os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)
                else:
                    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = previous_ffmpeg_options

        if cap is None or not cap.isOpened():
            if cap is not None:
                cap.release()
            self._cap = None
            self._is_open = False
            self._consecutive_failures += 1
            raise IOError(f"OpenCV cannot open live source: {self._source_id}")

        # Best-effort latency tuning (TCP for RTSP; small buffer). Non-fatal.
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            if self._source_type == SourceType.RTSP:
                cap.set(cv2.CAP_PROP_RTSP_TRANSPORT, cv2.CAP_PROP_RTSP_TRANSPORT_TCP)
        except Exception:
            pass

        self._fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        self._width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self._cap = cap
        self._is_open = True
        self._consecutive_failures = 0
        self._last_read_monotonic = time.monotonic()
        logger.info(
            "Live source opened: %s | %dx%d | %.1f fps (type=%s)",
            self._source_id, self._width, self._height, self._fps, self._source_type.value,
        )

    def open_with_timeout(self, timeout_seconds: float | None = None) -> None:
        """Bound the capture open so a dead source can never be stuck opening.

        Some native backends ignore OPEN_TIMEOUT_MSEC and block inside
        ``cv2.VideoCapture(...)``. This runs the open in a worker thread and, if
        it exceeds the wall-clock budget (defaults to the connect timeout),
        raises IOError exactly like a failed attempt — the pipeline then reports
        OFFLINE and backs off instead of lingering on CONNECTING. Such a hung
        open stays quarantined (identical to the read path): the camera reports
        unavailable until that open exits, and threads cannot multiply. If the
        quarantined open later completes, the orphaned capture is released by
        the next successful open.
        """
        if self._pending_read is not None and self._pending_read.is_alive():
            raise IOError(f"Previous decoder read still active: {self._source_id}")
        if self._pending_open is not None and self._pending_open is not threading.current_thread() and self._pending_open.is_alive():
            raise IOError(f"Previous decoder open still active: {self._source_id}")

        budget = float(timeout_seconds) if timeout_seconds is not None else self._connect_timeout
        block_duration = max(0.05, min(budget, 60.0) + 0.5)
        result: dict = {"done": False}

        def _blocking_open():
            try:
                self.open()
                result["ok"] = True
            except Exception as e:  # noqa: BLE001 - surfaced as a failed attempt
                result["exc"] = e
            finally:
                result["done"] = True
                self._pending_open = None

        worker = threading.Thread(target=_blocking_open, daemon=True,
                                  name=f"capture-open-{self._source_id}")
        self._pending_open = worker
        worker.start()

        if not result["done"] and not worker.join(timeout=block_duration):
            logger.warning(
                "Live open timed out after %.0fs: %s — treating as failed attempt",
                budget, self._source_id,
            )
            self._last_failure_reason = "open_timeout"
            self._is_open = False
            raise IOError(f"Live open timed out: {self._source_id}")

        worker.join()
        self._pending_open = None
        if "exc" in result:
            raise result["exc"]

    def is_open(self) -> bool:
        return self._is_open and self._cap is not None

    def read(self) -> tuple[bool, np.ndarray | None]:
        if not self._is_open or self._cap is None:
            return False, None

        try:
            ret, frame = self._read_with_timeout()
        except Exception as e:
            logger.warning("Live read exception %s (%s)", self._source_id, type(e).__name__)
            self._consecutive_failures += 1
            self._last_failure_reason = "read_exception"
            return False, None

        if not ret or frame is None or not self._valid_frame(frame):
            self._consecutive_failures += 1
            if self._last_failure_reason is None:
                if not ret:
                    self._last_failure_reason = "capture_returned_false"
                elif frame is None:
                    self._last_failure_reason = "frame_none"
                else:
                    self._last_failure_reason = "invalid_frame_dimensions"
            now_mono = time.monotonic()
            if (
                self._consecutive_failures == STREAM_MAX_CONSECUTIVE_READ_FAILURES
                or now_mono - self._last_failure_log_monotonic >= 5.0
            ):
                # Likely a disconnected/hung stream -> surface failure so the
                # caller's rebuild/backoff logic can reconnect promptly.
                logger.warning("Live source %s producing invalid frames", self._source_id)
                self._last_failure_log_monotonic = now_mono
            return False, None

        self._consecutive_failures = 0
        self._last_failure_reason = None
        self._total_frames_read += 1
        self._last_read_monotonic = time.monotonic()
        self._last_read_at_utc = __import__("utils.time", fromlist=["utc_iso"]).utc_iso()
        return True, frame

    def _read_with_timeout(self) -> tuple[bool, np.ndarray | None]:
        """Bound the caller's wait without releasing a capture during its read.

        Some native backends ignore timeouts. Such a read stays quarantined:
        the camera reports unavailable and cannot open a replacement until that
        read exits. Other cameras remain independent and threads cannot multiply.
        """
        if self._pending_read is not None and self._pending_read.is_alive():
            return False, None
        result: dict = {}
        done = threading.Event()
        capture = self._cap

        def _blocking_read():
            try:
                with _suppress_native_stderr():
                    result["ret"], result["frame"] = capture.read()
            except Exception as e:  # noqa: BLE001 - surface as failure below
                result["exc"] = e
            finally:
                done.set()

        worker = threading.Thread(target=_blocking_read, daemon=True,
                                  name=f"capture-read-{self._source_id}")
        self._pending_read = worker
        worker.start()

        if not done.wait(timeout=max(0.05, min(self._read_timeout, 60.0) + 0.5)):
            logger.warning(
                "Live read timed out after %.0fs: %s — awaiting safe decoder shutdown",
                self._read_timeout, self._source_id,
            )
            self._last_failure_reason = "read_timeout"
            self._is_open = False
            return False, None

        worker.join()
        self._pending_read = None
        if "exc" in result:
            raise result["exc"]
        return result.get("ret", False), result.get("frame")

    def _force_close(self) -> None:
        """Close the capture without resetting the failure state (used on hang)."""
        self.close()

    def _valid_frame(self, frame: np.ndarray) -> bool:
        if frame is None:
            return False
        h, w = frame.shape[:2]
        if h <= 0 or w <= 0:
            return False
        # Reject mostly-empty/blank captures that are not real video.
        if frame.size == 0:
            return False
        return True

    def is_stale(self, stale_seconds: float) -> bool:
        """True when no fresh frame arrived within `stale_seconds`."""
        if not self._is_open:
            return False
        return (time.monotonic() - self._last_read_monotonic) > stale_seconds

    def get_metadata(self) -> dict:
        return {
            "sourceId": self._source_id,
            "sourceType": self._source_type.value,
            "protocol": self._protocol or None,
            "fps": self._fps,
            "width": self._width,
            "height": self._height,
            "framesRead": self._total_frames_read,
            "isOpen": self._is_open,
            "consecutiveFailures": self._consecutive_failures,
            "lastReadAt": self._last_read_at_utc,
            "secondsSinceLastFrame": round(self.seconds_since_last_frame(), 3),
            "captureIsOpened": self.capture_is_open(),
            "lastFailureReason": self._last_failure_reason,
            "readerMode": "synchronous",
            "connectTimeoutSeconds": self._connect_timeout,
            "readTimeoutSeconds": self._read_timeout,
        }

    def close(self) -> bool:
        self._is_open = False
        if self._pending_read is not None and self._pending_read.is_alive():
            return False
        if self._pending_open is not None and self._pending_open.is_alive():
            return False
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception as e:
                logger.warning("Live source release error %s (%s)", self._source_id, type(e).__name__)
            self._cap = None
        self._is_open = False
        logger.info("Live source released: %s", self._source_id)
        return True

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
