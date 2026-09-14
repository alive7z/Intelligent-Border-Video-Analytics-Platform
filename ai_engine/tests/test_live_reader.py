import os
import sys
import time
import threading
import pytest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np

from streaming.live_reader import LiveVideoSource
from streaming.video_source import SourceType


def make_live(stream_url="http://127.0.0.1/mjpeg", **kw):
    return LiveVideoSource(
        stream_url=stream_url,
        source_id="CAM-LIVE",
        source_type=SourceType.HTTP,
        **kw,
    )


def test_initial_metadata_shape():
    src = make_live()
    meta = src.get_metadata()
    assert meta["sourceId"] == "CAM-LIVE"
    assert meta["sourceType"] == SourceType.HTTP.value
    assert meta["isOpen"] is False
    assert meta["framesRead"] == 0
    assert meta["consecutiveFailures"] == 0


def test_not_open_no_read():
    src = make_live()
    ok, frame = src.read()
    assert ok is False
    assert frame is None


def test_stale_true_when_open_and_stalled():
    src = make_live()
    src._is_open = True
    src._last_read_monotonic = time.monotonic() - 10.0
    assert src.is_stale(5.0) is True


def test_stale_false_when_not_open():
    src = make_live()
    assert src.is_stale(5.0) is False


def test_valid_frame_accepts_real_image():
    src = make_live()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    assert src._valid_frame(frame) is True


def test_valid_frame_rejects_empty():
    src = make_live()
    assert src._valid_frame(None) is False
    assert src._valid_frame(np.zeros((0, 0, 3), dtype=np.uint8)) is False


def test_mobile_resolves_to_http_by_default():
    src = LiveVideoSource(
        stream_url="http://127.0.0.1/phone",
        source_id="CAM-PHONE",
        source_type=SourceType.MOBILE,
        protocol="HTTP",
    )
    assert src.source_type == SourceType.HTTP


def test_rtsp_open_forces_tcp_and_applies_timeouts(monkeypatch):
    calls = []

    class FakeCapture:
        def isOpened(self):
            return True

        def get(self, _prop):
            return 0.0

        def set(self, _prop, _value):
            return True

        def release(self):
            return None

    def fake_video_capture(url, *args):
        calls.append((url, args, os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS")))
        return FakeCapture()

    monkeypatch.delenv("OPENCV_FFMPEG_CAPTURE_OPTIONS", raising=False)
    monkeypatch.setattr(cv2, "VideoCapture", fake_video_capture)
    src = LiveVideoSource(
        stream_url="rtsp://127.0.0.1/live",
        source_id="CAM-RTSP",
        source_type=SourceType.RTSP,
        connect_timeout_seconds=7.0,
        read_timeout_seconds=9.0,
    )

    src.open()

    assert calls[0][0] == "rtsp://127.0.0.1/live"
    assert calls[0][1][0] == cv2.CAP_FFMPEG
    params = calls[0][1][1]
    assert params[params.index(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC) + 1] == 7000
    assert params[params.index(cv2.CAP_PROP_READ_TIMEOUT_MSEC) + 1] == 9000
    opts = calls[0][2]
    assert opts.startswith("rtsp_transport;tcp")
    assert "fflags;nobuffer" in opts
    assert "flags;low_delay" in opts
    assert "reorder_queue_size;0" in opts
    assert "OPENCV_FFMPEG_CAPTURE_OPTIONS" not in os.environ


def test_non_rtsp_never_sets_ffmpeg_options(monkeypatch):
    calls = []

    class FakeCapture:
        def isOpened(self):
            return True

        def get(self, _prop):
            return 0.0

        def set(self, _prop, _value):
            return True

        def release(self):
            return None

    def fake_video_capture(url, *args):
        calls.append((url, args, os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS")))
        return FakeCapture()

    monkeypatch.delenv("OPENCV_FFMPEG_CAPTURE_OPTIONS", raising=False)
    monkeypatch.setattr(cv2, "VideoCapture", fake_video_capture)
    src = LiveVideoSource(
        stream_url="http://127.0.0.1/mjpeg",
        source_id="CAM-CAM",
        source_type=SourceType.HTTP,
    )

    src.open()

    assert calls[0][0] == "http://127.0.0.1/mjpeg"
    assert calls[0][2] is None or "OPENCV_FFMPEG_CAPTURE_OPTIONS" not in os.environ


class _HungCapture:
    """A capture whose read() blocks forever (RTSP hang)."""

    def isOpened(self):
        return True

    def get(self, _prop):
        return 25.0

    def set(self, _prop, _value):
        return True

    def read(self):
        while True:
            time.sleep(60)

    def release(self):
        return None


def test_read_timeout_breaks_hung_capture_and_forces_reconnect(monkeypatch):
    monkeypatch.setattr(cv2, "VideoCapture", lambda *a, **k: _HungCapture())
    src = LiveVideoSource(
        stream_url="rtsp://127.0.0.1/live",
        source_id="CAM-HANG",
        source_type=SourceType.RTSP,
        read_timeout_seconds=0.2,
    )
    src.open()
    assert src.is_open() is True

    start = time.monotonic()
    ret, frame = src.read()
    elapsed = time.monotonic() - start

    assert ret is False
    assert frame is None
    assert src.consecutive_failures == 1
    assert src._last_failure_reason == "read_timeout"
    assert elapsed < 5.0, "hung read must not block the pipeline"
    # The timed-out capture must be closed so the caller can reconnect.
    assert src.is_open() is False


def test_read_timeout_recovers_after_hang(monkeypatch):
    """A read that eventually completes (after the deadline is irrelevant here)
    must return the frame normally, not be reported as a failure."""

    class SlowCapture(_HungCapture):
        def __init__(self):
            self._reads = 0

        def read(self):
            self._reads += 1
            if self._reads == 1:
                time.sleep(0.5)
            return True, np.zeros((480, 640, 3), dtype=np.uint8)

    monkeypatch.setattr(cv2, "VideoCapture", lambda *a, **k: SlowCapture())
    src = LiveVideoSource(
        stream_url="rtsp://127.0.0.1/live",
        source_id="CAM-SLOW",
        source_type=SourceType.RTSP,
        read_timeout_seconds=2.0,
    )
    src.open()
    ret, frame = src.read()
    assert ret is True
    assert frame is not None
    assert src._last_failure_reason is None
    assert src.consecutive_failures == 0


def test_timed_out_read_never_releases_or_duplicates_native_decoder(monkeypatch):
    release_read = threading.Event()
    captures = []
    class Capture(_HungCapture):
        releases = 0
        def read(self):
            release_read.wait(timeout=3)
            return True, np.zeros((4, 4, 3), dtype=np.uint8)
        def release(self):
            self.releases += 1
    def create(*args):
        capture = Capture()
        captures.append(capture)
        return capture
    monkeypatch.setattr(cv2, "VideoCapture", create)
    src = make_live(read_timeout_seconds=0.05)
    src.open()
    try:
        assert src.read() == (False, None)
        assert src.close() is False
        with pytest.raises(IOError, match="Previous decoder read"):
            src.open()
        assert len(captures) == 1
        assert captures[0].releases == 0
    finally:
        release_read.set()
        src._pending_read.join(timeout=1)
        assert src.close() is True
    assert captures[0].releases == 1


def test_a_stalled_camera_does_not_serialize_other_camera_reads(monkeypatch):
    rendezvous = threading.Barrier(2)
    class Capture(_HungCapture):
        def read(self):
            rendezvous.wait(timeout=1)
            return True, np.zeros((4, 4, 3), dtype=np.uint8)
    monkeypatch.setattr(cv2, "VideoCapture", lambda *args: Capture())
    sources = [make_live(read_timeout_seconds=2) for _ in range(2)]
    for source in sources:
        source.open()
    results = []
    threads = [threading.Thread(target=lambda src=source: results.append(src.read()[0])) for source in sources]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)
    assert results == [True, True]
    for source in sources:
        source.close()
