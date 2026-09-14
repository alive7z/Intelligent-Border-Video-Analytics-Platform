"""Conservative plate text normalization.

Rules applied:
  - uppercase
  - strip surrounding whitespace
  - collapse internal runs of whitespace to a single space
  - remove clearly unsupported punctuation (dots, quotes, slashes, underscores,
    braces, etc.) while keeping a hyphen as a possible plate separator

We deliberately do NOT perform speculative character substitution such as
O↔0 or I↔1 unless a documented plate-format rule requires it. Callers must
keep raw_text alongside normalized_text.
"""

import re

# Characters considered supported in a normalized plate (India/dev context).
ALLOWED = re.compile(r"[^A-Z0-9 -]")
# Punctuation we strip out entirely (never replaced with a digit/letter).
UNSUPPORTED = set(".,;:'\"`~!@#$%^&*()[]{}<>_+=/\\|")


def normalize_plate_text(raw: str | None) -> str | None:
    """Return the normalized plate text, or None when input is empty/None."""
    if not raw:
        return None
    text = raw.upper().strip()
    text = re.sub(r"\s+", " ", text)
    # Remove unsupported punctuation characters.
    text = "".join(ch for ch in text if ch not in UNSUPPORTED)
    text = re.sub(r"\s+", "", text)  # drop internal spaces for a compact form
    text = text.replace("-", "").strip()
    return text or None


def is_equivalent(canonical_a: str | None, candidate_b: str | None) -> bool:
    """Cheap equality for consensus — exact normalized match (no fuzzy logic)."""
    if not canonical_a or not candidate_b:
        return False
    return canonical_a == candidate_b


def supports_observed_registration(raw_normalized: str, observed_valid: str) -> bool:
    """Position-aware ambiguity support, only for an independently read plate.

    Never generate a registration from a regex. The target must already exist
    as a valid OCR sample. No insertion/deletion or arbitrary substitution.
    """
    from anpr.validator import indian_format_check
    if not indian_format_check(observed_valid) or len(raw_normalized) != len(observed_valid):
        return False
    pairs = {frozenset(pair) for pair in ("O0", "I1", "L1", "B8", "S5", "Z2", "G6")}
    return all(a == b or (a.isdigit() != b.isdigit() and frozenset((a, b)) in pairs)
               for a, b in zip(raw_normalized, observed_valid))
