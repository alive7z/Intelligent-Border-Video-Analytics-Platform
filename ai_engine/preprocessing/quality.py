"""Lightweight visibility/crop diagnostics, never a threat or identity score."""

import time

import cv2
import numpy as np

import config


def image_metrics(frame: np.ndarray, max_width: int = 640) -> dict:
    """Measure original dimensions and sharpness at a bounded analysis size."""
    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return {}
    h, w = frame.shape[:2]
    sample = frame
    if w > max_width:
        sample = cv2.resize(frame, (max_width, max(1, round(h * max_width / w))), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY) if sample.ndim == 3 else sample
    return {
        "width": w, "height": h,
        "analysisWidth": int(gray.shape[1]), "analysisHeight": int(gray.shape[0]),
        "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2),
        "brightness": round(float(gray.mean()), 2),
        "contrast": round(float(gray.std()), 2),
        "underexposedFraction": round(float(np.mean(gray < 16)), 4),
        "overexposedFraction": round(float(np.mean(gray > 239)), 4),
    }


class CameraQualityAnalyzer:
    """One cached analyzer per camera. Thresholds can be camera overrides."""

    def __init__(
        self, enabled: bool = config.CAMERA_QUALITY_ENABLED,
        sample_seconds: float = config.CAMERA_QUALITY_SAMPLE_SECONDS,
        blur_threshold: float = config.CAMERA_QUALITY_BLUR_THRESHOLD,
        dark_threshold: float = config.CAMERA_QUALITY_DARK_THRESHOLD,
        bright_threshold: float = config.CAMERA_QUALITY_BRIGHT_THRESHOLD,
        exposure_fraction: float = config.CAMERA_QUALITY_EXPOSURE_FRACTION,
    ):
        self._enabled = enabled
        self._interval = max(0.0, sample_seconds)
        self._blur = blur_threshold
        self._dark = dark_threshold
        self._bright = bright_threshold
        self._exposure = exposure_fraction
        self._last_at = None
        self._last = {}

    def analyze(self, frame: np.ndarray, now: float | None = None) -> dict:
        now = time.monotonic() if now is None else now
        if not self._enabled:
            return {"status": "DISABLED", "reasons": []}
        if frame is None or getattr(frame, "size", 0) == 0:
            return {"status": "UNAVAILABLE", "brightnessStatus": "UNKNOWN", "reasons": ["NO_FRAME"]}
        if self._last_at is not None and 0 <= now - self._last_at < self._interval:
            return {**self._last, "reasons": list(self._last["reasons"])}
        metrics = image_metrics(frame)
        reasons = []
        brightness = "NORMAL"
        if metrics["brightness"] < self._dark or metrics["underexposedFraction"] >= self._exposure:
            brightness = "TOO_DARK"
            reasons.append("LOW_LIGHT")
        elif metrics["brightness"] > self._bright or metrics["overexposedFraction"] >= self._exposure:
            brightness = "OVEREXPOSED"
            reasons.append("OVEREXPOSURE")
        if metrics["sharpness"] < self._blur:
            reasons.append("LOW_SHARPNESS")
        status = "POOR" if len(reasons) > 1 else ("DEGRADED" if reasons else "GOOD")
        self._last_at = now
        self._last = {**metrics, "status": status, "brightnessStatus": brightness,
                      "reasons": reasons, "measuredAt": round(time.time(), 3)}
        return {**self._last, "reasons": list(reasons)}


def assess_crop(frame: np.ndarray, bbox, *, kind: str) -> tuple[np.ndarray | None, dict]:
    """Reject clipped, blank, undersized or plainly unusable evidence crops."""
    if frame is None or getattr(frame, "size", 0) == 0:
        return None, {"accepted": False, "score": 0.0, "reasons": ["NO_FRAME"]}
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox.x1, bbox.y1, bbox.x2, bbox.y2
    if not all(np.isfinite(v) for v in (x1, y1, x2, y2)) or x1 < 0 or y1 < 0 or x2 > w or y2 > h or x2 <= x1 or y2 <= y1:
        return None, {"accepted": False, "score": 0.0, "reasons": ["CLIPPED_OR_INVALID"]}
    crop = frame[int(y1):int(y2), int(x1):int(x2)]
    metrics = image_metrics(crop)
    if not metrics:
        return None, {"accepted": False, "score": 0.0, "reasons": ["EMPTY_CROP"]}
    face = kind == "face"
    minimum = config.FACE_MIN_SIZE if face else config.ANPR_MIN_PLATE_SIZE
    sharpness_min = config.FACE_QUALITY_MIN_SHARPNESS if face else config.ANPR_QUALITY_MIN_SHARPNESS
    dark = config.FACE_QUALITY_MIN_BRIGHTNESS if face else 20
    bright = config.FACE_QUALITY_MAX_BRIGHTNESS if face else 240
    reasons = []
    if min(metrics["width"], metrics["height"]) < minimum:
        reasons.append("TOO_SMALL")
    if metrics["sharpness"] < sharpness_min:
        reasons.append("LOW_SHARPNESS")
    if metrics["brightness"] < dark or metrics["brightness"] > bright:
        reasons.append("EXPOSURE")
    if not face and metrics["contrast"] < config.ANPR_QUALITY_MIN_CONTRAST:
        reasons.append("LOW_CONTRAST")
    aspect = metrics["width"] / max(1, metrics["height"])
    # Wide bound allows single-line and two-line plates; heuristic regions
    # cannot support geometric/perspective claims without plate corners.
    if not face and not 0.8 <= aspect <= 8.0:
        reasons.append("ASPECT_RATIO")
    score = (0.40 * min(1.0, metrics["sharpness"] / max(1.0, sharpness_min * 4))
             + 0.30 * min(1.0, min(metrics["width"], metrics["height"]) / max(1, minimum * 3))
             + 0.30 * max(0.0, 1.0 - abs(metrics["brightness"] - 127.5) / 127.5))
    return crop, {**metrics, "aspectRatio": round(aspect, 3), "accepted": not reasons,
                  "score": round(score, 4), "reasons": reasons}
