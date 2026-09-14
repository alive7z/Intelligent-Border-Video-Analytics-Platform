"""Plate-region detector.

A dedicated plate model may be provided via ANPR_MODEL_PATH (a YOLO-family
weights file). If that file is not present, the detector uses a STRUCTURAL
localizer that searches the confirmed vehicle bbox for plate-like rectangular
regions (bright/dark Otsu separation + geometric gates), falling back to the
documented DEVELOPMENT lower-center strip only when no plate-like structure is
found. Standard COCO YOLO11n does NOT reliably detect license plates, so we
never assume it does.

The detector reports honestly which mode/localizer is active and never
fabricates a plate measurement.
"""

import math
from pathlib import Path

import cv2
import numpy as np

from config import (
    ANPR_DETECTION_CONFIDENCE,
    ANPR_MODEL_PATH,
    BASE_DIR,
    WEIGHTS_DIR,
)
from anpr.models import PlateBBox, PlateDetection
from utils.logger import get_logger

logger = get_logger("anpr_detector")

# Structural locator gates (tuned for measured 1280x720 test footage).
_STRUCT_MIN_WIDTH = 28      # plate narrow edge (px) lower bound
_STRUCT_MIN_HEIGHT = 8      # plate short edge (px) lower bound
_STRUCT_MIN_ASPECT = 1.7    # two-line and motorcycle plates still qualify
_STRUCT_MAX_ASPECT = 7.5    # very long truck/American plates
_STRUCT_ASPECT_REF = 3.4    # tuned for Indian single-line plates
_STRUCT_MIN_FILL = 0.42     # contour area / rect area -> reject noise
_STRUCT_MIN_AREA_FRAC = 0.02
_STRUCT_MAX_AREA_FRAC = 0.55  # a plate is smaller than half the bumper zone
_STRUCT_CONF_BASE = 0.45
_STRUCT_DEDUP_IOU = 0.5
_STRUCT_DESKEW_MIN_ANGLE = 7.0  # degrees; below this the crop is near-aligned


class PlateDetector:
    """Detects the plate region within a vehicle bbox."""

    def __init__(
        self,
        model_path: str = ANPR_MODEL_PATH,
        confidence: float = ANPR_DETECTION_CONFIDENCE,
    ):
        self._name = model_path
        self._confidence = confidence
        self._model = None
        self._loaded = False
        self._load_errors = 0
        self._mode = "HEURISTIC"
        self._localization = "STRUCTURAL+LEGACY_FALLBACK"
        self._resolved_path = None

    def load(self) -> bool:
        """Attempt to load a dedicated plate model. Fall back to heuristic."""
        path = None
        p = Path(self._name)
        if p.exists():
            path = str(p)
        else:
            weights_path = WEIGHTS_DIR / self._name
            if weights_path.exists():
                path = str(weights_path)
        if not path:
            self._mode = "HEURISTIC"
            self._loaded = True
            logger.info(
                "ANPR plate model '%s' not found — using STRUCTURAL plate locator "
                "inside the vehicle ROI (lower-central plate band) with the legacy "
                "lower-center strip as safety net.", self._name
            )
            return True

        try:
            from ultralytics import YOLO

            self._model = YOLO(path)
            self._loaded = True
            self._mode = "MODEL"
            self._resolved_path = path
            logger.info("ANPR plate model loaded: %s | mode=MODEL", path)
            return True
        except Exception as e:  # noqa: BLE001
            self._load_errors += 1
            self._loaded = False
            self._mode = "ERROR"
            logger.error("ANPR plate model load FAILED: %s", e)
            return False

    def detect(self, frame: np.ndarray, vehicle_bbox: dict) -> list[PlateDetection]:
        """Detect plate regions within the given vehicle bbox (pixel coords).

        Returns an empty list when nothing credible is found. Never guesses.
        """
        if not self._loaded:
            return []

        if self._mode == "MODEL" and self._model is not None:
            try:
                results = self._model(
                    frame,
                    conf=self._confidence,
                    device="cpu",
                    verbose=False,
                )
                dets = []
                h, w = frame.shape[:2]
                for result in results:
                    if result.boxes is None:
                        continue
                    for box in result.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0])
                        x1 = max(0.0, min(x1, w))
                        y1 = max(0.0, min(y1, h))
                        x2 = max(0.0, min(x2, w))
                        y2 = max(0.0, min(y2, h))
                        if x1 >= x2 or y1 >= y2:
                            continue
                        dets.append(PlateDetection(
                            bbox=PlateBBox(x1=x1, y1=y1, x2=x2, y2=y2),
                            confidence=round(conf, 4),
                        ))
                # Restrict detections to ones inside/overlapping the vehicle bbox.
                in_vehicle = []
                for d in dets:
                    if _overlaps_vehicle(d.bbox, vehicle_bbox):
                        in_vehicle.append(d)
                return in_vehicle
            except Exception as e:  # noqa: BLE001
                logger.error("ANPR plate model inference failed: %s", e)
                return []

        # STRUCTURAL dev mode (no dedicated weights): search the vehicle ROI for
        # plate-like rectangles; only fall back to the legacy lower-center strip
        # when nothing credible is found. Keeps MODEL mode untouched.
        x1, y1, x2, y2 = vehicle_bbox["x1"], vehicle_bbox["y1"], vehicle_bbox["x2"], vehicle_bbox["y2"]
        if not all(np.isfinite(v) for v in (x1, y1, x2, y2)):
            return []
        h, w = frame.shape[:2]
        x1 = max(0.0, min(x1, w))
        y1 = max(0.0, min(y1, h))
        x2 = max(0.0, min(x2, w))
        y2 = max(0.0, min(y2, h))
        if x1 >= x2 or y1 >= y2:
            return []
        roi = frame[int(y1):int(y2), int(x1):int(x2)]
        if roi is None or getattr(roi, "size", 0) == 0:
            return []
        vh = y2 - y1
        vw = x2 - x1
        if vh <= 0 or vw <= 0:
            return []
        # Positional prior band (a search window, not a fixed bbox): plates sit
        # in the lower-central bumper zone of the vehicle. The exact rectangle
        # inside the band is still located structurally (Otsu + contour gates).
        band = frame[int(y1 + 0.58 * vh):int(y2), int(x1 + 0.12 * vw):int(x1 + 0.88 * vw)]
        if band is None or getattr(band, "size", 0) == 0:
            return []
        band_gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY) if band.ndim == 3 else band
        ox, oy = x1 + 0.12 * vw, y1 + 0.58 * vh
        candidates = _structural_plate_candidates(band)
        if candidates:
            dets = []
            for (px1, py1, px2, py2), conf, angle in candidates:
                r = _refine_text_band(band_gray, px1, py1, px2, py2)
                if r is not None:
                    px1, py1, px2, py2 = r
                dets.append(PlateDetection(
                    bbox=PlateBBox(x1=ox + px1, y1=oy + py1,
                                   x2=ox + px2, y2=oy + py2),
                    confidence=round(conf, 4),
                    angle=round(angle, 2),
                ))
            return sorted(dets, key=lambda d: -d.confidence)

        # Final fallback: legacy lower 35% strip when nothing tightened.
        plate_y1 = y2 - 0.35 * vh
        plate_y2 = y2
        plate_x1 = x1 + 0.15 * vw
        plate_x2 = x2 - 0.15 * vw
        if plate_x1 >= plate_x2 or plate_y1 >= plate_y2:
            return []
        return [PlateDetection(
            bbox=PlateBBox(x1=plate_x1, y1=plate_y1, x2=plate_x2, y2=plate_y2),
            confidence=round(self._confidence, 4),
        )]

    def _localizer_summary(self) -> str:
        if self._mode == "MODEL":
            return "DEDICATED_MODEL"
        return self._localization

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def mode(self) -> str:
        return self._mode

    def get_info(self) -> dict:
        return {
            "enabled": self._loaded,
            "mode": self._mode,
            "localization": self._localizer_summary(),
            "modelPath": self._name,
            "resolutionType": "resolved" if self._resolved_path else "unresolved",
            "confidence": self._confidence,
            "loadErrors": self._load_errors,
        }


def _structural_plate_candidates(roi: np.ndarray) -> list[tuple[tuple, float, float]]:
    """Locate plate-like rectangles inside the vehicle ROI.

    Returns relative (x1, y1, x2, y2) bboxes, a confidence and the plate's
    rotation angle (degrees, clockwise-positive long axis). Empty when no
    plate-like structure is found (caller then uses the legacy strip).
    """
    h, w = roi.shape[:2]
    if h < 24 or w < 48:
        return []
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    candidates: list[tuple[tuple, float, float]] = []
    for invert in (False, True):
        flag = (cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY) + cv2.THRESH_OTSU
        try:
            _, binimg = cv2.threshold(gray, 0, 255, flag)
        except cv2.error:
            continue
        contours, _ = cv2.findContours(binimg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            if cnt is None or len(cnt) < 4:
                continue
            rect = cv2.minAreaRect(cnt)
            (cx, cy), (rw, rh), _ang = rect
            if rw < rh:
                rw, rh = rh, rw
            if rw < _STRUCT_MIN_WIDTH or rh < _STRUCT_MIN_HEIGHT or rh <= 0:
                continue
            aspect = rw / rh
            if not (_STRUCT_MIN_ASPECT <= aspect <= _STRUCT_MAX_ASPECT):
                continue
            area = cv2.contourArea(cnt)
            if area < max(120.0, _STRUCT_MIN_AREA_FRAC * w * h):
                continue
            if area > _STRUCT_MAX_AREA_FRAC * w * h:
                continue
            fill = area / max(1.0, rw * rh)
            if fill < _STRUCT_MIN_FILL:
                continue
            if not (0.10 * w <= cx <= 0.90 * w):
                continue
            if not (0.30 * h <= cy <= 1.0 * h):
                continue
            pts = cv2.boxPoints(rect)
            bx0, by0 = int(pts[:, 0].min()), int(pts[:, 1].min())
            bx1, by1 = int(pts[:, 0].max()), int(pts[:, 1].max())
            if bx1 <= bx0 or by1 <= by0:
                continue
            bx0 = max(0, bx0); by0 = max(0, by0)
            bx1 = min(w, bx1); by1 = min(h, by1)
            if bx1 <= bx0 or by1 <= by0:
                continue
            aspect_ok = math.exp(-((math.log(aspect / _STRUCT_ASPECT_REF)) ** 2) / 0.6)
            conf = min(0.95, _STRUCT_CONF_BASE + 0.50 * fill * aspect_ok)
            candidates.append(((bx0, by0, bx1, by1), conf, _plate_angle(pts)))
    return _dedupe_candidates(candidates)


def _plate_angle(box_points: np.ndarray) -> float:
    """Degrees of the plate's long axis vs horizontal (clockwise-positive, |a|<=90)."""
    pts = box_points
    best = 0.0
    best_len = -1.0
    n = len(pts)
    for i in range(n):
        dx = pts[(i + 1) % n][0] - pts[i][0]
        dy = pts[(i + 1) % n][1] - pts[i][1]
        length = math.hypot(dx, dy)
        if length > best_len:
            best_len = length
            best = math.degrees(math.atan2(dy, dx))
    if best > 90.0:
        best -= 180.0
    elif best < -90.0:
        best += 180.0
    return float(best)


def _iou(a: tuple, b: tuple) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = ix2 - ix1, iy2 - iy1
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    ab = (a[2] - a[0]) * (a[3] - a[1])
    bb = (b[2] - b[0]) * (b[3] - b[1])
    union = ab + bb - inter
    return inter / union if union > 0 else 0.0


def _refine_text_band(gray: np.ndarray, x1: int, y1: int, x2: int, y2: int):
    """Tighten a candidate plate bbox onto the character band via edge density.

    Returns a smaller (x1, y1, x2, y2) or None when the band is degenerate.
    """
    sub = gray[y1:y2, x1:x2]
    if sub.size == 0 or sub.shape[0] < 4 or sub.shape[1] < 8:
        return None
    sobelx = cv2.Sobel(sub, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(sub, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(sobelx, sobely)
    row_energy = mag.mean(axis=1)
    thr = max(float(row_energy.mean()) * 0.9, float(mag.max()) * 0.06, 1e-3)
    hot = row_energy > thr
    if not hot.any():
        return None
    # Choose the horizontal run of high-edge rows that best balances length and
    # energy density (character band) — a long bumper shadow with sparse edges
    # must not win over the denser 26-row plate text band.
    runs = []
    lo = None
    for i, on in enumerate(hot.tolist()):
        if on:
            if lo is None:
                lo = i
        elif lo is not None:
            runs.append((lo, i))
            lo = None
    if lo is not None:
        runs.append((lo, len(hot)))
    runs = [(a, b) for a, b in runs if b - a >= 6]
    if not runs:
        return None
    best_lo, best_hi = max(runs, key=lambda ab: (ab[1] - ab[0]) * float(row_energy[ab[0]:ab[1]].mean()))
    y0 = y1 + best_lo
    y1n = y1 + best_hi
    col_energy = mag[best_lo:best_hi, :].mean(axis=0)
    cthr = max(float(col_energy.mean()) * 0.55, float(col_energy.max()) * 0.18, 1e-3)
    hotc = col_energy > cthr
    if not hotc.any():
        return None
    # Merge column runs across small intra-plate gaps (e.g. "KA 02 AB 1234"),
    # then take the widest run so the box hugs the whole string.
    col_runs = []
    lo = None
    for i, on in enumerate(hotc.tolist()):
        if on:
            if lo is None:
                lo = i
        elif lo is not None:
            col_runs.append([lo, i])
            lo = None
    if lo is not None:
        col_runs.append([lo, len(hotc)])
    merged = []
    for r in col_runs:
        if merged and r[0] - merged[-1][1] <= max(8, int((best_hi - best_lo) * 0.6)):
            merged[-1][1] = r[1]
        else:
            merged.append(list(r))
    widest = max(merged, key=lambda r: r[1] - r[0])
    x0 = x1 + widest[0]
    x1n = x1 + widest[1]
    tw, th = x1n - x0, y1n - y0
    if tw < _STRUCT_MIN_WIDTH or th < _STRUCT_MIN_HEIGHT:
        return None
    aspect = tw / th
    if not (_STRUCT_MIN_ASPECT <= aspect <= _STRUCT_MAX_ASPECT):
        return None
    # Keep text horizontally but never inflate beyond the candidate box.
    x0 = max(x1, x0)
    x1n = min(x2, x0 + tw)
    return (x0, y0, x1n, y1n)


def _dedupe_candidates(candidates: list[tuple[tuple, float, float]]) -> list[tuple[tuple, float, float]]:
    merged: list[tuple[tuple, float, float]] = []
    for c in sorted(candidates, key=lambda c: -c[1]):
        if all(_iou(c[0], m[0]) < _STRUCT_DEDUP_IOU for m in merged):
            merged.append(c)
    return merged


def _overlaps_vehicle(plate: PlateBBox, vehicle_bbox: dict) -> bool:
    """True if the plate bbox's center lies inside the (slightly padded) vehicle bbox."""
    cx = (plate.x1 + plate.x2) / 2.0
    cy = (plate.y1 + plate.y2) / 2.0
    pad_x = 0.0
    pad_y = 0.0
    return (
        vehicle_bbox["x1"] - pad_x <= cx <= vehicle_bbox["x2"] + pad_x
        and vehicle_bbox["y1"] - pad_y <= cy <= vehicle_bbox["y2"] + pad_y
    )
