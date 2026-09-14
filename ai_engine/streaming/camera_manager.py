"""Discover configured cameras and supervise one independent pipeline per camera."""
import asyncio
from dataclasses import dataclass
import threading

from api.camera_registry import discard
from utils.logger import get_logger

logger = get_logger("camera_manager")
LIVE_TYPES = {"RTSP", "HTTP", "MJPEG", "MOBILE"}


@dataclass
class CameraWorker:
    stop: threading.Event
    thread: threading.Thread


class CameraManager:
    def __init__(self, client, pipeline, camera_codes=None, refresh_seconds=10):
        self.client = client
        self.pipeline = pipeline
        self.camera_codes = set(camera_codes) if camera_codes else None
        self.refresh_seconds = max(0.05, float(refresh_seconds))
        self._stop = threading.Event()
        self._lock = threading.RLock()
        self._workers: dict[str, CameraWorker] = {}
        self._thread = None

    def start(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="camera-manager", daemon=True)
            self._thread.start()

    def _run(self):
        while not self._stop.is_set():
            try:
                result = asyncio.run(self.client.fetch_source_configs())
                if result.get("ok"):
                    self.reconcile(result.get("cameras", []))
                else:
                    logger.warning("Camera discovery unavailable; retaining current workers (%s)", result.get("error"))
            except Exception as exc:
                logger.error("Camera discovery failed (%s)", type(exc).__name__)
            self._stop.wait(self.refresh_seconds)

    def reconcile(self, configs):
        desired = {
            item["cameraCode"] for item in configs
            if item.get("cameraCode") and item.get("enabled")
            and item.get("sourceType") in LIVE_TYPES and item.get("streamUrl")
            and (self.camera_codes is None or item["cameraCode"] in self.camera_codes)
        }
        with self._lock:
            if self._stop.is_set():
                return
            for code, worker in list(self._workers.items()):
                if code not in desired:
                    worker.stop.set()
                # Never replace a stopping camera while any of its work is alive.
                if not worker.thread.is_alive():
                    del self._workers[code]
                    if code not in desired:
                        discard(code)
            for code in sorted(desired - self._workers.keys()):
                stop = threading.Event()
                thread = threading.Thread(
                    target=self._supervise, args=(code, stop),
                    name=f"camera-pipeline-{code}", daemon=True,
                )
                self._workers[code] = CameraWorker(stop, thread)
                thread.start()

    def _supervise(self, code, stop):
        while not stop.is_set() and not self._stop.is_set():
            try:
                self.pipeline(code, stop_event=stop)
            except Exception as exc:
                logger.error("Camera pipeline %s stopped (%s); retrying", code, type(exc).__name__)
            stop.wait(self.refresh_seconds)

    def active_workers(self):
        with self._lock:
            return {code: worker.thread.is_alive() for code, worker in self._workers.items()}

    def stop(self, timeout=12):
        self._stop.set()
        with self._lock:
            workers = list(self._workers.values())
            for worker in workers:
                worker.stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)
        for worker in workers:
            worker.thread.join(timeout=timeout)
        return all(not worker.thread.is_alive() for worker in workers)
