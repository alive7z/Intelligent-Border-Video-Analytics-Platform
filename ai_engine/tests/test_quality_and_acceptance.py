import numpy as np
import cv2

from anpr.models import PlateBBox, PlateCandidate
from anpr.state import AnprState
from anpr.validator import validate_plate, VALID_FORMAT, PARTIAL
from faces.state import FaceState
from faces.models import FaceBBox
from preprocessing.quality import CameraQualityAnalyzer, assess_crop


def candidate(text="UK04AB1234", confidence=0.85, quality=0.7):
    return PlateCandidate(text, text, confidence, 0.8, PlateBBox(10, 10, 150, 50), quality)


def test_high_quality_valid_first_read_is_accepted_immediately():
    state = AnprState(confirm_reads=3)
    result = state.update(7, candidate(confidence=0.95), now=1)
    assert result.plate_text == "UK04AB1234"
    assert result.acceptance_method == "FIRST_READ"
    assert result.confirmation_reads == 1


def test_consensus_beats_a_single_high_confidence_outlier():
    state = AnprState(confirm_reads=2)
    assert state.update(7, candidate("UK04AB4321", 0.95, 0.3), now=1) is None
    assert state.update(7, candidate(confidence=0.85), now=1.5) is None
    result = state.update(7, candidate(confidence=0.87), now=2)
    assert result.plate_text == "UK04AB1234"
    assert result.acceptance_method == "TEMPORAL_CONSENSUS"


def test_old_ocr_reads_cannot_confirm_minutes_later():
    state = AnprState(confirm_reads=2)
    state.update(7, candidate(), now=1)
    assert state.update(7, candidate(), now=181) is None


def test_secondary_state_survives_brief_misses_and_expires_after_loss():
    plate = AnprState(confirm_reads=1, timeout_seconds=5)
    face = FaceState(confirm_frames=1, timeout_seconds=5)
    plate.update(7, candidate(), now=100)
    face.update(7, 0.9, FaceBBox(10, 10, 50, 50), now=100)
    for state in (plate, face):
        state.mark_emitted(7)
        assert state.cleanup_expired(set(), now=101) == 0
        assert state.cleanup_expired({7}, now=102) == 0
        assert state.is_emitted(7)
        assert state.cleanup_expired(set(), now=108) == 1


def test_plate_format_rejects_fragments_and_supports_bh_and_short_district():
    for text in ("2363", "DV2363", "12345678", "ABCDEFGH"):
        assert validate_plate(text, 0.99) == PARTIAL
    for text in ("UK04AB1234", "DL8CAB1234", "22BH1234AA"):
        assert validate_plate(text, 0.95) == VALID_FORMAT


def test_visibility_diagnostics_are_separate_from_risk():
    analyzer = CameraQualityAnalyzer(sample_seconds=0)
    textured = np.random.default_rng(7).integers(50, 200, (120, 180, 3), dtype=np.uint8)
    good = analyzer.analyze(textured)
    blurred = analyzer.analyze(cv2.GaussianBlur(textured, (31, 31), 8))
    dark = analyzer.analyze(np.zeros_like(textured))
    bright = analyzer.analyze(np.full_like(textured, 255))
    assert good["status"] == "GOOD"
    assert blurred["status"] == "DEGRADED" and "LOW_SHARPNESS" in blurred["reasons"]
    assert dark["status"] == "POOR" and dark["brightnessStatus"] == "TOO_DARK"
    assert bright["brightnessStatus"] == "OVEREXPOSED"
    assert "riskScore" not in dark


def test_blank_face_and_clipped_plate_crops_are_rejected():
    frame = np.zeros((100, 200, 3), dtype=np.uint8)
    _, face = assess_crop(frame, FaceBBox(10, 10, 60, 60), kind="face")
    _, plate = assess_crop(frame, PlateBBox(-1, 10, 160, 50), kind="plate")
    assert face["accepted"] is False
    assert plate["accepted"] is False
