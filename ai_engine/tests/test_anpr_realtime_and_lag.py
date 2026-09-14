"""Focused tests for the live-latency + realtime ANPR work.

Covers the three fixes under test:
  1. ANPR color-crop OCR fallback (when enhanced-crop OCR returns no text).
  2. Realtime ANPR observations carry the LIVE camera code once assigned by
     main.py (not fabricated or left blank at the module level).
  3. RTSP low-latency FFmpeg capture options preserve TCP transport while
     shrinking FFmpeg's input buffers so cap.read() tracks the live edge.
Reuse of existing frame-buffer/latest-frame/MJPEG coverage is intentional.
"""

import numpy as np
from anpr.manager import AnprManager
from anpr.models import OcrRead, PlateBBox, PlateDetection
from anpr.normalize import normalize_plate_text

from streaming.live_reader import LiveVideoSource
from streaming.preview import LatestFrameStore
from streaming.video_source import SourceType

PLATE_BBOX = {"x1": 60.0, "y1": 80.0, "x2": 170.0, "y2": 115.0}


class StubDetector:
    def __init__(self, detections):
        self._detections = detections
        self._loaded = True
        self._mode = "HEURISTIC"

    def load(self):
        return True

    def detect(self, frame, vehicle_bbox):
        return self._detections

    @property
    def is_loaded(self):
        return True

    @property
    def mode(self):
        return self._mode


class FallbackOCR:
    """OCR that returns None for the enhanced crop but succeeds on the raw color
    crop — exercises the manager's fallback path."""

    def __init__(self, raw_text="KA01AB1234", confidence=0.95):
        self._raw_text = raw_text
        self._confidence = confidence
        self._loaded = True
        self._calls = []

    def load(self):
        return True

    def read(self, crop, latency_ms=None):
        self._calls.append("raw" if crop is None else crop)
        # Deliberately return nothing on the FIRST call (enhanced/any crop) and
        # a valid read on the SECOND (color fallback) call.
        if len(self._calls) == 1:
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        return OcrRead(
            raw_text=self._raw_text,
            normalized_text=normalize_plate_text(self._raw_text),
            ocr_confidence=self._confidence,
        )

    @property
    def is_loaded(self):
        return True

    @property
    def status(self):
        return "READY"


def _sample_frame():
    return np.random.default_rng(42).integers(40, 215, (200, 320, 3), dtype=np.uint8)


def _det():
    return StubDetector(
        [PlateDetection(bbox=PlateBBox(**PLATE_BBOX), confidence=0.8)]
    )


# ------------------------------------------------ ANPR color fallback


def test_anpr_color_crop_fallback_confirms_observation():
    ocr = FallbackOCR()
    mgr = AnprManager(enabled=True, detector=_det(), ocr=ocr, confirm_reads=1, min_ocr_confidence=0.6, every_n_frames=1)
    mgr.initialize()
    obs = mgr.process_frame(_sample_frame(), {12: PLATE_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert len(obs) == 1
    assert obs[0].plate_text == "KA01AB1234"


def test_anpr_fallback_does_not_fabricate_when_both_ocr_fail():
    class AlwaysNoneOCR(FallbackOCR):
        def read(self, crop, latency_ms=None):
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)

    mgr = AnprManager(enabled=True, detector=_det(), ocr=AlwaysNoneOCR(), confirm_reads=1, min_ocr_confidence=0.6, every_n_frames=1)
    mgr.initialize()
    obs = mgr.process_frame(_sample_frame(), {12: PLATE_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert obs == []


# ------------------------------------------------ realtime camera code


def test_anpr_observation_carries_assigned_live_camera_code():
    """main.py assigns camera_code onto each fresh observation; the payload
    must reflect the live camera (CAM-01), not a baked-in value."""
    from anpr.models import PlateObservation

    mgr = AnprManager(enabled=True, detector=_det(), ocr=FallbackOCR(), confirm_reads=1, min_ocr_confidence=0.6, every_n_frames=1)
    mgr.initialize()
    obs = mgr.process_frame(_sample_frame(), {12: PLATE_BBOX}, "2026-01-01T00:00:00Z", 1000)
    assert len(obs) == 1
    obs[0].camera_code = "CAM-01"
    assert isinstance(obs[0], PlateObservation)
    assert obs[0].to_payload()["cameraCode"] == "CAM-01"


# ------------------------------------------------ RTSP low-latency capture


def test_rtsp_capture_options_keep_tcp_and_add_low_latency():
    src = LiveVideoSource(
        stream_url="rtsp://127.0.0.1/live",
        source_id="CAM-RTSP",
        source_type=SourceType.RTSP,
    )
    opts = src._capture_options()
    assert opts is not None
    assert opts.startswith("rtsp_transport;tcp")
    assert "analyzeduration;500000" in opts
    assert "probesize;500000" in opts
    assert "reorder_queue_size;0" in opts
    assert "fflags;nobuffer" in opts
    assert "flags;low_delay" in opts


def test_rtsp_capture_options_first_option_is_tcp():
    # The transport MUST precede and be preserved so RTSP stays over TCP
    # regardless of the low-latency flags added after it.
    src = LiveVideoSource(
        stream_url="rtsp://127.0.0.1/live",
        source_id="CAM-RTSP",
        source_type=SourceType.RTSP,
    )
    first = src._capture_options().split("|", 1)[0]
    assert first == "rtsp_transport;tcp"


def test_capture_options_none_for_non_rtsp():
    src = LiveVideoSource(
        stream_url="http://127.0.0.1/mjpeg",
        source_id="CAM-HTTP",
        source_type=SourceType.HTTP,
    )
    assert src._capture_options() is None


# ------------------------------------------------ preview latest-frame


def test_latest_frame_store_prioritizes_newest():
    store = LatestFrameStore()
    frame1 = np.zeros((20, 20, 3), dtype=np.uint8)
    frame2 = np.full((20, 20, 3), 255, dtype=np.uint8)
    store.set(frame1)
    store.set(frame2)
    got, _ = store.get()
    assert got is not None
    assert got[0, 0, 0] == 255
