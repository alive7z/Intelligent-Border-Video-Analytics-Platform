"""Plate validation.

At minimum validates: minimum length, maximum length, allowed characters, and
OCR confidence. A conservative Indian registration format check is provided for
development. A non-matching read is PARTIAL and is never persisted as an accepted
registration. We never fabricate missing characters or claim all formats work.
"""

import re
import math

from config import ANPR_MIN_OCR_CONFIDENCE

MIN_LEN = 4
MAX_LEN = 12

# Allowed characters in a normalized plate (Indian/dev style: letters, digits, hyphen).
ALLOWED_RE = re.compile(r"^[A-Z0-9-]+$")

# Supported conventional registrations and BH-series registrations.
INDIAN_FORMAT_RE = re.compile(r"^(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$")

VALID_FORMAT = "VALID_FORMAT"
PARTIAL = "PARTIAL"
LOW_CONFIDENCE = "LOW_CONFIDENCE"
UNREADABLE = "UNREADABLE"


def char_check(normalized: str | None) -> bool:
    if not normalized:
        return False
    return bool(ALLOWED_RE.match(normalized))


def length_check(normalized: str | None) -> bool:
    if not normalized:
        return False
    return MIN_LEN <= len(normalized) <= MAX_LEN


def indian_format_check(normalized: str | None) -> bool:
    if not normalized:
        return False
    return bool(INDIAN_FORMAT_RE.match(normalized))


def validate_plate(
    normalized: str | None,
    ocr_confidence: float,
    min_ocr_confidence: float = ANPR_MIN_OCR_CONFIDENCE,
) -> str:
    """Classify a plate read into a validation state.

    Order of precedence:
      1. No text at all            -> UNREADABLE
      2. Below OCR confidence min  -> LOW_CONFIDENCE
      3. Fails char or length rule -> PARTIAL
      4. Supported full format     -> VALID_FORMAT
    """
    if not normalized:
        return UNREADABLE
    if not math.isfinite(ocr_confidence) or not 0 <= ocr_confidence <= 1 or ocr_confidence < min_ocr_confidence:
        return LOW_CONFIDENCE
    if not char_check(normalized) or not length_check(normalized):
        return PARTIAL
    if not indian_format_check(normalized):
        return PARTIAL
    return VALID_FORMAT


def is_confirmed(normalized: str | None, ocr_confidence: float, min_ocr_confidence: float = ANPR_MIN_OCR_CONFIDENCE) -> bool:
    """A plate is confirmation-eligible only when it is a full VALID_FORMAT
    read (char + length rules) and meets the OCR confidence threshold.

    PARTIAL reads (e.g. a lone `3` or `D` fragment) are deliberately NOT
    confirmation-eligible: persisting partial fragments as if they were a plate
    is what previously stored `3`/`D`/`2363` instead of the full plate. We never
    fabricate the missing characters — we simply do not confirm a partial read.
    """
    state = validate_plate(normalized, ocr_confidence, min_ocr_confidence)
    return state == VALID_FORMAT
