"""Conservative OCR preprocessing.

Only non-destructive enhancements are applied: grayscale, capped resize,
gentle contrast enhancement, and light denoise. We do NOT apply aggressive
morphology or binarization that could destroy plate characters.

Both the original crop and the enhanced crop are returned so callers may
compare if needed.
"""

import math

import cv2
import numpy as np


def deskew_plate_crop(crop: np.ndarray, angle: float = 0.0) -> np.ndarray:
    """Rotate a plate crop so its long axis becomes horizontal.

    Only applied for |angle| >= 7 degrees (small angles add no OCR value).
    Uses border replication and an inner-rectangle center crop so no black
    borders confuse OCR. Returns the original crop when not applicable.
    """
    if crop is None or crop.size == 0:
        return crop
    if not angle or abs(angle) < 7.0:
        return crop
    h, w = crop.shape[:2]
    theta = math.radians(angle)
    center = (w / 2.0, h / 2.0)
    m = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos, sin = abs(m[0, 0]), abs(m[0, 1])
    nw = int(round(h * sin + w * cos))
    nh = int(round(h * cos + w * sin))
    m[0, 2] += nw / 2.0 - center[0]
    m[1, 2] += nh / 2.0 - center[1]
    rotated = cv2.warpAffine(crop, m, (nw, nh), flags=cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_REPLICATE)
    # Largest axis-aligned rectangle fully inside the rotated crop.
    inner_w = int(round(w * cos - h * sin))
    inner_h = int(round(h * cos - w * sin))
    if inner_w < 8 or inner_h < 8:
        return rotated
    x0 = max(0, (nw - inner_w) // 2)
    y0 = max(0, (nh - inner_h) // 2)
    return rotated[y0:y0 + inner_h, x0:x0 + inner_w]


def _normalize_size(crop: np.ndarray, max_width: int = 320) -> np.ndarray:
    """Scale the crop up so characters are clearer, but never destructively."""
    h, w = crop.shape[:2]
    if w == 0 or h == 0:
        return crop
    scale = max_width / float(w)
    if scale < 1.0:
        scale = 1.0
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    return cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)


def _enhance(gray: np.ndarray) -> np.ndarray:
    # Gentle contrast stretch (clahe), then light bilateral denoise.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    # Bilateral filter preserves edges while smoothing noise.
    denoised = cv2.bilateralFilter(enhanced, 5, 60, 60)
    return denoised


def preprocess_plate_crop(crop: np.ndarray):
    """Enhance a plate crop for OCR.

    Returns (gray, enhanced) where:
      - gray is the resized grayscale original (for comparison)
      - enhanced is the OCR-ready enhanced grayscale image
    """
    if crop is None or crop.size == 0:
        return None, None
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = _normalize_size(gray)
    enhanced = _enhance(gray)
    return gray, enhanced
