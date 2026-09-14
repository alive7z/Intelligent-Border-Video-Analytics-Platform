"""Tests for the STRUCTURAL plate locator in anpr.detector.

Focus: the fallback (non-MODEL) path must (a) find a tight plate-like
rectangle inside the vehicle ROI, (b) recover a rotation angle, (c) fall back
to the legacy lower-center strip when no plate structure exists, and (d) leave
the dedicated MODEL path untouched. Uses synthetic plates only — no weights,
no network, no real footage.
"""

import cv2
import numpy as np

from config import ANPR_DETECTION_CONFIDENCE
from anpr.detector import PlateDetector
from anpr.preprocess import deskew_plate_crop


def _canvas(body=60, size=(480, 360)):
    img = np.full((size[1], size[0], 3), body, dtype=np.uint8)
    return img


def _draw_plate(img, text="KA02AB1234", wh=(260, 60)):
    h, w = img.shape[:2]
    pw, ph = wh
    x0 = (w - pw) // 2
    y0 = int(0.74 * h) - ph // 2
    img[y0:y0 + ph, x0:x0 + pw] = (255, 255, 255)
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.9
    thickness = 2
    (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)
    cv2.putText(img, text, (x0 + 6, y0 + ph // 2 + th // 2), font, scale, (0, 0, 0), thickness)
    return img, (x0, y0, x0 + pw, y0 + ph)


def _rotate(canvas, deg, border=0):
    h, w = canvas.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw = int(round(h * sin + w * cos))
    nh = int(round(h * cos + w * sin))
    m[0, 2] += nw / 2 - w / 2
    m[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(canvas, m, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=(border,) * 3)


def _rotated_plate_canvas(deg=9.0, border=60):
    """Vehicle canvas with a plate that was rotated *by itself* then embedded,
    so the full tilted plate sits inside the search band (nothing clipped)."""
    plate_canvas = np.full((140, 320, 3), border, dtype=np.uint8)
    img, _ = _draw_plate(plate_canvas, wh=(260, 60))
    return _paste(_rotate(img, deg, border=border), _canvas())


def _paste(src, dst, y_frac=0.72):
    h, w = dst.shape[:2]
    sh, sw = src.shape[:2]
    x0 = (w - sw) // 2
    y0 = int(y_frac * h) - sh // 2
    dst[y0:y0 + sh, x0:x0 + sw] = src
    return dst


def _vehicle_bbox_of(img):
    h, w = img.shape[:2]
    return {"x1": 0.0, "y1": 0.0, "x2": float(w), "y2": float(h)}


def test_structural_locator_finds_tight_plate_crop():
    img, plate = _draw_plate(_canvas())
    det = PlateDetector()  # no weights present -> STRUCTURAL/HEURISTIC
    det.load()
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert hits, "structural locator returned no plate on a synthetic plate"
    best = hits[0]
    bw, bh = best.bbox.x2 - best.bbox.x1, best.bbox.y2 - best.bbox.y1
    assert bw >= 150 and bh >= 20, f"plate bbox too small: {bw}x{bh}"
    assert 3.0 <= bw / max(1.0, bh) <= 7.0, f"plate aspect off: {bw / max(1.0, bh)}"
    cx = (best.bbox.x1 + best.bbox.x2) / 2
    cy = (best.bbox.y1 + best.bbox.y2) / 2
    assert plate[0] <= cx <= plate[2] and plate[1] <= cy <= plate[3]
    assert best.confidence > 0.4


def test_structural_locator_recovers_plate_rotation_angle():
    rotated = _rotated_plate_canvas(deg=9.0)
    det = PlateDetector()
    det.load()
    hits = det.detect(rotated, _vehicle_bbox_of(rotated))
    assert hits, "no plate on rotated synthetic canvas"
    angle = abs(hits[0].angle)
    assert 5.0 <= angle <= 13.0, f"recovered angle {angle:.1f} far from 9.0"
    assert abs(hits[0].angle) >= 7.0, "rotated plate should trigger deskew path"


def test_legacy_bottom_center_strip_when_no_plate_structure():
    img = _canvas()
    # Almost-uniform body with mild noise: no plate-like rectangle.
    rng = np.random.default_rng(0)
    img = img + rng.integers(0, 6, size=img.shape, dtype=np.uint8)
    det = PlateDetector()
    det.load()
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert len(hits) == 1
    h, w = img.shape[:2]
    expected = {
        "x1": 0.15 * w, "y1": h - 0.35 * h,
        "x2": 0.85 * w, "y2": float(h),
    }
    assert abs((hits[0].bbox.x1 + hits[0].bbox.x2) / 2 - (expected["x1"] + expected["x2"]) / 2) < 2.0
    assert hits[0].confidence == round(ANPR_DETECTION_CONFIDENCE, 4)


def test_model_mode_uses_dedicated_model_only():
    class _StubBoxItem:
        xyxy = [np.array([50.0, 50.0, 260.0, 110.0])]
        conf = [np.float32(0.9)]

    class _StubBoxes:
        def __iter__(self):
            return iter([_StubBoxItem()])

    class _StubResult:
        boxes = _StubBoxes()

    class _StubModel:
        def __call__(self, *args, **kwargs):
            return [_StubResult()]

    det = PlateDetector()
    det._loaded = True
    det._mode = "MODEL"
    det._model = _StubModel()
    img = _canvas()
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert len(hits) == 1
    assert hits[0].confidence == 0.9
    assert hits[0].bbox.x1 == 50.0


def test_deskew_plate_crop_noop_for_small_angle_and_valid_for_large():
    img = np.ones((120, 300, 3), dtype=np.uint8) * 200
    cv2.putText(img, "KA02AB1234", (20, 90), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 0, 0), 3)
    assert deskew_plate_crop(img, 0.0) is img
    assert deskew_plate_crop(img, 4.0) is img
    rotated = _rotate(img, 9.0, border=200)
    out = deskew_plate_crop(rotated, 9.0)
    assert out is not None and out.size > 0
    assert out.shape[0] <= rotated.shape[0]
    assert out.shape[0] < rotated.shape[0], "deskew should recover vertical extent"


def test_manager_stats_reports_structural_localizer_as_degraded():
    from anpr.manager import AnprManager
    from anpr.ocr import PlateOCR

    det = PlateDetector()
    mgr = AnprManager(enabled=True, detector=det, ocr=PlateOCR())
    mgr.initialize()
    stats = mgr.get_stats()
    assert stats["status"] == "DEGRADED"
    assert stats["detectorMode"] == "HEURISTIC"
    assert stats["detectorLocalization"] == "STRUCTURAL+LEGACY_FALLBACK"