"""Plate OCR using EasyOCR (single documented OCR engine).

EasyOCR is used because it is the simpler, more stable option that integrates
cleanly with the existing Python 3.11 + torch + Apple Silicon environment
(PaddleOCR's paddlepaddle wheel coverage for this stack lags).

The model is loaded lazily so unit tests (and pipeline startup) never block on
a download. If EasyOCR is unavailable or fails, OCR reports UNAVAILABLE and
returns rawText=null — the rest of the pipeline continues.

Reading strategy (honest, no fabrication):
  - EasyOCR segments a plate into several text regions (`MH20`, `DV`, `2363`).
    Reading only the single highest-confidence region (as earlier versions did)
    discarded the other characters, so partial fragments like `2363` or `3` were
    stored instead of the full plate. We therefore rejoin the regions of the most
    plate-like reading-order line into one full-text read.
  - A dim/skewed plate can defeat CLAHE-bilateral enhancement alone. Additional
    variants are scored and the best is kept: an adaptive-threshold binarization,
    plus a two-pass refinement that re-OCRs an upscaled crop tight around the
    detected text row. On real live frames the refinement recovers a leading
    prefix (e.g. `MH20`) that the plain enhanced read drops.
  - No character substitution is performed and no text is ever fabricated; a weak
    prefix stays in the read with its own confidence, and unreadable crops return
    raw_text=None.
"""

import time

import cv2
import numpy as np

from anpr.models import OcrRead
from utils.logger import get_logger

logger = get_logger("anpr_ocr")

# Drop isolated EasyOCR regions whose confidence is below this floor before
# assembling a line. This removes stray noise glyphs while keeping a weak but
# real prefix region (e.g. a `KA` state-code at ~0.25–0.35 that EasyOCR splits
# off from the rest of an Indian plate). Lowering the floor from 0.30 to 0.22
# retains those weak state-code regions, turning truncated reads like
# `02HH1826` into the complete `KA02HH1826` without admitting whole-plate noise.
_REGION_CONF_FLOOR = 0.22
# Target minimum plate-crop height in pixels before OCR (upscales tiny crops so
# glyphs are actually resolvable — 6px-tall characters are not readable).
_MIN_CROP_HEIGHT = 120
# A full plate read is considered good early-out material (skip extra variants).
_EARLY_OUT_MIN_LEN = 5
_EARLY_OUT_MIN_CONF = 0.90
# Padding added around the detected text row before the refinement crop.
_REFIT_PAD = 6


class PlateOCR:
    """Runs OCR on a plate crop and returns an OcrRead with honest confidence."""

    def __init__(self, allowlist: str = None):
        self._reader = None
        self._loaded = False
        self._load_errors = 0
        self._status = "NOT_LOADED"
        # Conservative allowlist: alphanumerics plus a space/hyphen. No O↔0/I↔1
        # substitution is performed by the OCR layer.
        self._allowlist = allowlist or "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

    def load(self) -> bool:
        try:
            import easyocr  # lazy import

            self._reader = easyocr.Reader(["en"], gpu=False, download_enabled=False)
            self._loaded = True
            self._status = "READY"
            logger.info("EasyOCR loaded (status=READY)")
            return True
        except Exception as e:  # noqa: BLE001
            self._load_errors += 1
            self._loaded = False
            self._status = "ERROR"
            logger.error("EasyOCR failed to load: %s", e)
            return False

    def read(self, crop, latency_ms: list | None = None):
        """Run OCR on a plate crop.

        Returns an OcrRead. On failure or no text, raw_text is None (never
        fabricates a plate number).
        """
        if crop is None or crop.size == 0:
            logger.debug("OCR skip: crop is None or empty")
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        if not self._loaded or self._reader is None:
            logger.debug("OCR skip: reader not loaded")
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)

        start = time.time()
        try:
            candidate = self._best_candidate(crop)
        except Exception as e:  # noqa: BLE001
            logger.error("OCR inference failed: %s", e)
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)
        finally:
            if latency_ms is not None:
                latency_ms.append(round((time.time() - start) * 1000, 2))

        if candidate is None:
            logger.debug("OCR: no usable plate line in crop")
            return OcrRead(raw_text=None, normalized_text=None, ocr_confidence=0.0)

        text, conf = candidate
        logger.debug("OCR result: text=%r conf=%.3f", text, conf)
        return OcrRead(raw_text=text, normalized_text=None, ocr_confidence=round(float(conf), 4))

    def _best_candidate(self, crop):
        """Run OCR over preprocessing/refit variants and return the best plate read.

        Returns an (joined_text, confidence) tuple, or None when nothing is
        plate-like enough to report.
        """
        base_text, base_conf, base_box = self._read_line(crop)
        base_early = _is_early_out(base_text, base_conf)

        variants = []
        if not base_early:
            variants.append(("adaptive", _adaptive_threshold(crop)))
            # Two-pass refinement: upscale a crop tight around the row(s) of
            # text found in the first pass so small/angled prefix characters
            # become resolvable.
            if base_box is not None:
                refit = _refit_crop(crop, base_box)
                if refit is not None and refit is not crop:
                    variants.append(("refit", refit))
                    variants.append(("refit_adaptive", _adaptive_threshold(refit)))

        best = None
        base_score = _score_line(base_text, base_conf)
        if base_score is not None:
            best = (base_score, base_text, base_conf)
        for label, img in variants:
            text, min_conf, _ = self._read_line(img)
            scored = _score_line(text, min_conf)
            if scored is not None and (best is None or scored > best[0]):
                best = (scored, text, min_conf)
                logger.debug("OCR selected variant=%s line=%r", label, text)
        if best is None:
            return None
        return best[1], best[2]

    def _read_line(self, img):
        """OCR one image, rejoin its regions into a reading-order line.

        Returns (joined_text|None, minimum kept-region confidence, tight_box).
        `tight_box` is the (x0, y0, x1, y1) union of ALL regions assigned to the
        best text row (including low-confidence ones that extend the string),
        or None when no line exists.
        """
        results = self._reader.readtext(img, allowlist=self._allowlist, detail=1, paragraph=False)
        if not results:
            return None, 0.0, None

        tol = max(4.0, float(img.shape[0]) * 0.15)
        rows = []
        for bb, text, conf in results:
            text = (text or "").strip()
            if not text:
                continue
            cy = (bb[0][1] + bb[2][1]) / 2.0
            cx = bb[0][0]
            x0, y0 = bb[0][0], bb[0][1]
            x1, y1 = bb[2][0], bb[2][1]
            for row in rows:
                if abs(row["y"] - cy) <= tol:
                    row["items"].append((cx, text, conf))
                    row["box"] = (
                        min(row["box"][0], x0), min(row["box"][1], y0),
                        max(row["box"][2], x1), max(row["box"][3], y1),
                    )
                    break
            else:
                rows.append({"y": cy, "items": [(cx, text, conf)],
                             "box": (x0, y0, x1, y1)})

        best_line = None
        best_box = None
        best_score = None
        for row in rows:
            items = sorted(row["items"], key=lambda item: item[0])
            kept = [it for it in items if it[2] >= _REGION_CONF_FLOOR]
            if not kept:
                continue
            text = "".join(it[1] for it in kept)
            min_conf = min(float(it[2]) for it in kept)
            scored = _score_line(text, min_conf)
            if scored is not None and (best_score is None or scored > best_score):
                best_score = scored
                best_line = (text, min_conf)
                best_box = row["box"]
        if best_line is None:
            return None, 0.0, None
        return best_line[0], best_line[1], best_box

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def status(self) -> str:
        return self._status

    def get_info(self) -> dict:
        return {
            "loaded": self._loaded,
            "status": self._status,
            "engine": "easyocr",
            "loadErrors": self._load_errors,
        }


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _upscale(gray: np.ndarray) -> np.ndarray:
    """Upscale a small grayscale crop so its glyphs are resolvable by EasyOCR."""
    h, w = gray.shape[:2]
    if h == 0 or w == 0:
        return gray
    if h >= _MIN_CROP_HEIGHT:
        return gray
    scale = _MIN_CROP_HEIGHT / float(h)
    return cv2.resize(gray, (int(round(w * scale)), _MIN_CROP_HEIGHT),
                      interpolation=cv2.INTER_CUBIC)


def _adaptive_threshold(img: np.ndarray) -> np.ndarray:
    """Binarize a grayscale version of the crop for the OCR variant pass."""
    up = _upscale(_to_gray(img))
    return cv2.adaptiveThreshold(
        up, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 5
    )


def _refit_crop(crop: np.ndarray, box) -> np.ndarray | None:
    """Crop tight around the detected text row and upscale it.

    Returns None when the box is invalid or covers the whole input.
    """
    h, w = crop.shape[:2]
    x0 = max(0, int(round(box[0])) - _REFIT_PAD)
    y0 = max(0, int(round(box[1])) - _REFIT_PAD)
    x1 = min(w, int(round(box[2])) + _REFIT_PAD)
    y1 = min(h, int(round(box[3])) + _REFIT_PAD)
    if x0 >= x1 or y0 >= y1:
        return None
    if x1 - x0 >= w and y1 - y0 >= h:
        return None
    return _upscale(_to_gray(crop[y0:y1, x0:x1]))


def _score_line(text, min_conf):
    """Score a candidate plate line; prefer longer, coherent plate-like text.

    Returns an orderable score, or None when the line is not plate-like
    (empty or out of the plausible plate length range).
    """
    if not text or not (2 <= len(text) <= 14) or min_conf <= 0.0:
        return None
    # Length-weighted mean: a full 10-char plate with a weaker prefix should
    # still beat a clean 4-char fragment (`MH20DV2363` > `DV2363` > `2363`).
    from anpr.normalize import normalize_plate_text
    from anpr.validator import is_confirmed
    # Prefer a genuinely valid full registration over high-confidence noise.
    return (int(is_confirmed(normalize_plate_text(text), min_conf)),
            float(min_conf) * clamp(len(text), 4, 12))


def _is_early_out(text, min_conf) -> bool:
    from anpr.normalize import normalize_plate_text
    from anpr.validator import is_confirmed
    return bool(
        text
        and is_confirmed(normalize_plate_text(text), min_conf)
        and min_conf >= _EARLY_OUT_MIN_CONF
    )


def clamp(value, lo, hi):
    return max(lo, min(hi, value))
