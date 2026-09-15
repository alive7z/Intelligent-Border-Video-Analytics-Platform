"""Tests for the STRUCTURAL plate locator in anpr.detector.

Focus: the fallback (non-MODEL) path must (a) find a tight plate-like
rectangle inside the vehicle ROI, (b) recover a rotation angle, (c) fall back
to the legacy lower-center strip when no plate structure exists, and (d) leave
the dedicated MODEL path untouched. Uses synthetic plates only — no weights,
no network, no real footage.

The MODEL path is exercised with stub models so the tests are deterministic
regardless of whether `license_plate_detector.pt` is present on disk.
"""

import cv2
import numpy as np

from config import ANPR_DETECTION_CONFIDENCE
from anpr.detector import PlateDetector
from anpr.preprocess import deskew_plate_crop

# A name that never resolves to a real weights file -> deterministic HEURISTIC.
_UNRESOLVED_MODEL = "__missing_plate_model__.pt"


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
    det = PlateDetector(model_path=_UNRESOLVED_MODEL)  # no weights -> STRUCTURAL/HEURISTIC
    det.load()
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert hits, "structural locator returned no plate on a synthetic plate"
    best = hits[0]
    assert best.method == "STRUCTURAL", f"unexpected method {best.method}"
    bw, bh = best.bbox.x2 - best.bbox.x1, best.bbox.y2 - best.bbox.y1
    assert bw >= 150 and bh >= 20, f"plate bbox too small: {bw}x{bh}"
    assert 3.0 <= bw / max(1.0, bh) <= 7.0, f"plate aspect off: {bw / max(1.0, bh)}"
    cx = (best.bbox.x1 + best.bbox.x2) / 2
    cy = (best.bbox.y1 + best.bbox.y2) / 2
    assert plate[0] <= cx <= plate[2] and plate[1] <= cy <= plate[3]
    assert best.confidence > 0.4


def test_structural_locator_recovers_plate_rotation_angle():
    rotated = _rotated_plate_canvas(deg=9.0)
    det = PlateDetector(model_path=_UNRESOLVED_MODEL)
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
    det = PlateDetector(model_path=_UNRESOLVED_MODEL)
    det.load()
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert len(hits) == 1
    assert hits[0].method == "LEGACY"
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
    assert hits[0].method == "MODEL"


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

    det = PlateDetector(model_path=_UNRESOLVED_MODEL)
    mgr = AnprManager(enabled=True, detector=det, ocr=PlateOCR())
    mgr.initialize()
    stats = mgr.get_stats()
    assert stats["status"] == "DEGRADED"
    assert stats["detectorMode"] == "HEURISTIC"
    assert stats["detectorLocalization"] == "STRUCTURAL+LEGACY_FALLBACK"


class _Boxes:
    def __init__(self, items):
        self._items = items

    def __iter__(self):
        return iter(self._items)

    def __len__(self):
        return len(self._items)


class _BoxItem:
    def __init__(self, xyxy, conf):
        self.xyxy = [np.array(xyxy, dtype=np.float32)]
        self.conf = [np.float32(conf)]


class _BoxResult:
    def __init__(self, boxes):
        self.boxes = _Boxes([_BoxItem(xyxy, conf) for conf, xyxy in boxes])


class _EmptyResult:
    boxes = None


class _RecordingModel:
    """Records the image the plate model is called with; returns stub boxes."""

    def __init__(self, detections=(), error=False):
        self.detections = list(detections)
        self.error = error
        self.last_input = None
        self.calls = 0

    def __call__(self, image, *args, **kwargs):
        self.calls += 1
        if self.error:
            raise RuntimeError("plate model inference boom")
        self.last_input = image
        if not self.detections:
            return [_EmptyResult()]
        return [_BoxResult(self.detections)]


def _model_detector(model):
    det = PlateDetector()
    det._loaded = True
    det._mode = "MODEL"
    det._model = model
    return det


def test_model_mode_runs_on_vehicle_roi_and_maps_back():
    img = _canvas()
    rec = _RecordingModel(detections=[(0.88, (100.0, 120.0, 250.0, 160.0))])
    det = _model_detector(rec)
    vbox = {"x1": 50.0, "y1": 60.0, "x2": 430.0, "y2": 320.0}
    hits = det.detect(img, vbox)
    # ROI-only inference: the model saw the 380x260 crop, not the full frame.
    assert rec.last_input is not None
    assert rec.last_input.shape == (260, 380, 3)
    assert len(hits) == 1
    hit = hits[0]
    assert hit.method == "MODEL"
    assert hit.confidence == 0.88
    # ROI coords mapped back to full-frame pixels (offset 50, 60).
    assert (hit.bbox.x1, hit.bbox.y1, hit.bbox.x2, hit.bbox.y2) == (150.0, 180.0, 300.0, 220.0)


def test_model_mode_ranks_multiple_detections_by_confidence():
    img = _canvas()
    rec = _RecordingModel(detections=[
        (0.62, (20.0, 20.0, 80.0, 60.0)),
        (0.95, (200.0, 200.0, 300.0, 240.0)),
    ])
    det = _model_detector(rec)
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert [h.confidence for h in hits] == [0.95, 0.62]
    assert all(h.method == "MODEL" for h in hits)
    assert hits[0].bbox.x1 == 200.0


def test_model_mode_falls_back_to_structural_when_model_empty():
    img, _ = _draw_plate(_canvas())
    rec = _RecordingModel()
    det = _model_detector(rec)
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert hits, "model-empty fallback found no structural plate"
    assert all(h.method == "STRUCTURAL" for h in hits)


def test_model_mode_falls_back_to_legacy_when_no_plate_structure():
    img = _canvas()
    det = _model_detector(_RecordingModel())
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert len(hits) == 1
    assert hits[0].method == "LEGACY"
    assert hits[0].confidence == round(ANPR_DETECTION_CONFIDENCE, 4)


def test_model_inference_error_falls_back_to_structural():
    img, _ = _draw_plate(_canvas())
    det = _model_detector(_RecordingModel(error=True))
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert hits and all(h.method == "STRUCTURAL" for h in hits)


def test_plate_detection_and_observation_payload_carry_method():
    from anpr.models import PlateBBox, PlateDetection, PlateObservation

    det = PlateDetection(bbox=PlateBBox(1, 2, 3, 4), confidence=0.7, method="MODEL")
    assert det.method == "MODEL"
    default = PlateDetection(bbox=PlateBBox(1, 2, 3, 4))
    assert default.method == "STRUCTURAL"

    obs = PlateObservation(
        observation_id="obs-1", camera_code="cam", vehicle_track_id=7,
        plate_text="KA02AB1234", raw_text="KA 02 AB 1234",
        ocr_confidence=0.9, plate_detection_confidence=0.8,
        occurred_at="2026-01-01T00:00:00Z", source_timestamp_ms=0,
        bbox=PlateBBox(1, 2, 3, 4), localization_method="MODEL",
    )
    payload = obs.to_payload()
    assert payload["localizationMethod"] == "MODEL"


def test_real_plate_weights_resolve_to_model_mode_if_present():
    from pathlib import Path
    import config

    weights = Path(config.WEIGHTS_DIR) / config.ANPR_MODEL_PATH
    if not weights.exists():
        import pytest
        pytest.skip("license_plate_detector.pt not present; skipping real-weights smoke test")
    det = PlateDetector()
    assert det.load() is True
    assert det.mode == "MODEL"
    info = det.get_info()
    assert info["localization"] == "DEDICATED_MODEL"
    assert info["resolutionType"] == "resolved"
    # A synthetic vehicle canvas must never crash the model path and returns a
    # plate candidate from some localizer (MODEL/STRUCTURAL/LEGACY).
    img = _canvas()
    hits = det.detect(img, _vehicle_bbox_of(img))
    assert isinstance(hits, list)