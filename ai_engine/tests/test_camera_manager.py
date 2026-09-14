import threading
import time

from fastapi.testclient import TestClient
import pytest

from api import camera_registry, routes
from api.server import app
from streaming.camera_manager import CameraManager
from streaming.stream_health import StreamHealth, StreamStatus


def wait_for(predicate, timeout=1):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.005)
    assert predicate()


def config(code, enabled=True):
    return {"cameraCode": code, "enabled": enabled, "sourceType": "RTSP", "streamUrl": "rtsp://example.invalid/test"}


def test_camera_workers_are_unique_and_shutdown_is_isolated():
    entered = []
    exited = []
    def pipeline(code, stop_event):
        entered.append(code)
        stop_event.wait()
        exited.append(code)
    manager = CameraManager(None, pipeline, refresh_seconds=0.01)
    try:
        for _ in range(5):
            manager.reconcile([config("ONE"), config("TWO")])
        wait_for(lambda: len(entered) == 2)
        assert sorted(entered) == ["ONE", "TWO"]
        manager.reconcile([config("ONE"), config("TWO", False)])
        wait_for(lambda: "TWO" in exited)
        assert "ONE" not in exited
        wait_for(lambda: not manager.active_workers()["TWO"])
        manager.reconcile([config("ONE"), config("TWO")])
        wait_for(lambda: entered.count("TWO") == 2)
        assert entered.count("ONE") == 1
    finally:
        assert manager.stop(timeout=1)


def test_a_stopping_worker_cannot_be_replaced_while_still_alive():
    release = threading.Event()
    entered = []
    def pipeline(code, stop_event):
        entered.append(code)
        release.wait()
    manager = CameraManager(None, pipeline, refresh_seconds=0.01)
    try:
        manager.reconcile([config("ONE")])
        wait_for(lambda: len(entered) == 1)
        manager.reconcile([])
        manager.reconcile([config("ONE")])
        assert entered == ["ONE"]
    finally:
        release.set()
        assert manager.stop(timeout=1)


def test_discovery_failure_preserves_running_camera_and_recovers():
    class Client:
        calls = 0
        async def fetch_source_configs(self):
            self.calls += 1
            if self.calls == 1:
                return {"ok": True, "cameras": [config("ONE")]}
            if self.calls == 2:
                return {"ok": False, "error": "DB_UNAVAILABLE"}
            return {"ok": True, "cameras": [config("ONE"), config("TWO")]}
    entered = []
    def pipeline(code, stop_event):
        entered.append(code)
        stop_event.wait()
    manager = CameraManager(Client(), pipeline, refresh_seconds=0.01)
    try:
        manager.start()
        wait_for(lambda: len(entered) == 2)
        assert sorted(entered) == ["ONE", "TWO"]
    finally:
        assert manager.stop(timeout=1)


def test_health_and_preview_never_mix_cameras(monkeypatch):
    monkeypatch.setattr(camera_registry, "_cameras", {})
    barrier = threading.Barrier(2)
    @camera_registry.camera_scope
    def register(code, status):
        health = StreamHealth()
        health.set_status(status)
        health.set_session(f"session-{code}")
        routes.set_stream_health(health)
        barrier.wait(timeout=1)
        routes.set_live_source_info({"cameraCode": code, "sourceType": "RTSP"})
        # Opaque distinct stand-in stores verify HTTP routing, not JPEG encoding.
        routes.set_preview_store(code)
        routes.set_model_info({"loaded": True, "name": f"model-{code}"})
    workers = [threading.Thread(target=register, args=("ONE", StreamStatus.ONLINE)),
               threading.Thread(target=register, args=("TWO", StreamStatus.RECONNECTING))]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=2)
    monkeypatch.setattr(routes, "iter_mjpeg", lambda store: iter([store.encode()]))
    # Health uses actual preview stats; omit the fake stores for this one call.
    for runtime in camera_registry._cameras.values():
        runtime["preview"] = None
    client = TestClient(app)
    payload = client.get("/health").json()
    assert payload["cameras"]["ONE"]["stream"]["status"] == "ONLINE"
    assert payload["cameras"]["TWO"]["stream"]["status"] == "RECONNECTING"
    assert payload["cameras"]["ONE"]["stream"]["streamSessionId"] == "session-ONE"
    assert payload["cameras"]["TWO"]["model"]["name"] == "model-TWO"
    for code in ("ONE", "TWO"):
        camera_registry._cameras[code]["preview"] = code
        assert client.get(f"/internal/preview/{code}").content == code.encode()
    assert client.get("/internal/preview/UNKNOWN").status_code == 404
