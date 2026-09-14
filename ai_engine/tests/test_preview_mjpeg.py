import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

import api.routes as routes
import streaming.preview as preview_module
from api.server import app
from streaming.preview import (
    LatestFrameStore,
    _JPEG_HEADER,
    encode_jpeg,
    iter_mjpeg,
)
from streaming.stream_health import StreamHealth, StreamStatus


@pytest.fixture
def client():
    return TestClient(app)


def test_preview_disabled_returns_404(client, monkeypatch):
    monkeypatch.setattr(routes, "PREVIEW_ENABLED", False)
    resp = client.get("/internal/preview/CAM-01")
    assert resp.status_code == 404


def test_preview_no_store_returns_404(client, monkeypatch):
    monkeypatch.setattr(routes, "_global_preview_store", None)
    monkeypatch.setattr(routes, "_global_health", None)
    resp = client.get("/internal/preview/CAM-01")
    assert resp.status_code == 404


def test_preview_refuses_nonlive_stream(client, monkeypatch, sample_frame):
    # A frame is present in the store and the stream is RECONNECTING: the
    # endpoint must NOT hard-disconnect the browser during an RTSP frame gap —
    # it serves the latest cached frame instead (status 200). The upstream Node
    # gateway only fails when the source itself is unreachable.
    store = LatestFrameStore()
    store.set(sample_frame)
    health = StreamHealth()
    health.set_status(StreamStatus.RECONNECTING, "phone offline")
    monkeypatch.setattr(routes, "_global_preview_store", store)
    monkeypatch.setattr(routes, "_global_health", health)

    def finite_mjpeg(target_store):
        frame, _ = target_store.get()
        jpeg = encode_jpeg(frame)
        yield _JPEG_HEADER % len(jpeg) + jpeg + b"\r\n"

    monkeypatch.setattr(routes, "iter_mjpeg", finite_mjpeg)
    resp = client.get("/internal/preview/CAM-01")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("multipart/x-mixed-replace")
    assert resp.content.startswith(b"--frame\r\n")


def test_preview_rejects_a_different_camera(client, monkeypatch, sample_frame):
    store = LatestFrameStore()
    store.set(sample_frame)
    health = StreamHealth()
    health.set_status(StreamStatus.ONLINE)
    monkeypatch.setattr(routes, "_global_preview_store", store)
    monkeypatch.setattr(routes, "_global_health", health)
    monkeypatch.setattr(routes, "_global_source_info", {"cameraCode": "CAM-01"})

    resp = client.get("/internal/preview/CAM-02")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Camera preview source not active"


def test_preview_live_streams_multipart(client, monkeypatch, sample_frame):
    store = LatestFrameStore()
    store.set(sample_frame)
    health = StreamHealth()
    health.set_status(StreamStatus.ONLINE)
    monkeypatch.setattr(routes, "_global_preview_store", store)
    monkeypatch.setattr(routes, "_global_health", health)

    # The real iter_mjpeg is an infinite generator; for the HTTP-level contract
    # use a finite stand-in so TestClient can complete.
    def finite_mjpeg(target_store):
        frame, _ = target_store.get()
        jpeg = encode_jpeg(frame)
        yield _JPEG_HEADER % len(jpeg) + jpeg + b"\r\n"

    monkeypatch.setattr(routes, "iter_mjpeg", finite_mjpeg)
    resp = client.get("/internal/preview/CAM-01")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("multipart/x-mixed-replace")
    assert resp.content.startswith(b"--frame\r\n")


def test_iter_mjpeg_emits_real_jpeg_frames(sample_frame):
    store = LatestFrameStore()
    store.set(sample_frame)
    it = iter_mjpeg(store)
    chunk = next(it)
    assert chunk.startswith(b"--frame\r\nContent-Type: image/jpeg")
    assert b"Content-Length:" in chunk
    it.close()


def test_latest_store_encodes_once_per_frame_version(monkeypatch, sample_frame):
    store = LatestFrameStore()
    calls = []

    def fake_encode(_frame):
        calls.append(1)
        return b"jpeg"

    monkeypatch.setattr(preview_module, "encode_jpeg", fake_encode)
    store.set(sample_frame)
    assert store.get_encoded()[0] == b"jpeg"
    assert store.get_encoded()[0] == b"jpeg"
    assert len(calls) == 1

    store.set(sample_frame)
    assert store.get_encoded()[0] == b"jpeg"
    assert len(calls) == 2
