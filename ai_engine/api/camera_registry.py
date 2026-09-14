"""Thread-safe camera runtime metadata; no raw source URLs are retained here."""
from contextvars import ContextVar
from functools import wraps
from threading import RLock

_camera_code = ContextVar("runtime_camera_code", default=None)
_lock = RLock()
_cameras: dict[str, dict] = {}


def camera_scope(function):
    """Keep the existing pipeline publishers scoped to their camera thread."""
    @wraps(function)
    def wrapped(camera_code, *args, **kwargs):
        token = _camera_code.set(camera_code)
        with _lock:
            _cameras.setdefault(camera_code, {"source": {"cameraCode": camera_code}})
        try:
            return function(camera_code, *args, **kwargs)
        finally:
            _camera_code.reset(token)
    return wrapped


def publish(field, value) -> bool:
    code = _camera_code.get()
    if code is None:
        return False
    with _lock:
        _cameras.setdefault(code, {})[field] = dict(value) if isinstance(value, dict) else value
    return True


def snapshot() -> dict:
    with _lock:
        return {code: dict(runtime) for code, runtime in _cameras.items()}


def discard(camera_code):
    with _lock:
        _cameras.pop(camera_code, None)
