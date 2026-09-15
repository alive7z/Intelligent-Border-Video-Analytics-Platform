"""ANPR pipeline coordinator.

Per confirmed vehicle track:
  plate detect (inside vehicle bbox) -> crop -> preprocess -> OCR -> normalize
  -> validate -> associate -> accumulate state (multi-frame consensus).

Emits a single confirmed PlateObservation per vehicle track (dedup via state).
Model / OCR failures degrade gracefully and never crash the pipeline.
"""

import time
import uuid
import threading
import cv2
from collections import deque

import numpy as np

from anpr.association import associate_plate_to_track
from anpr.cropper import crop_plate
from anpr.detector import PlateDetector
from anpr.models import PlateBBox, PlateCandidate, PlateObservation
from anpr.normalize import normalize_plate_text
from anpr.ocr import PlateOCR
from anpr.preprocess import deskew_plate_crop, preprocess_plate_crop
from anpr.sample_window import PlateSampleWindows
from anpr.validator import VALID_FORMAT, validate_plate
from preprocessing.quality import assess_crop
from config import (
    ANPR_CONFIRM_READS,
    ANPR_DUP_IOU_THRESHOLD,
    ANPR_ENABLED,
    ANPR_MIN_OCR_CONFIDENCE,
    ANPR_PROCESS_EVERY_N_FRAMES,
    ANPR_PLATE_DEDUP_SECONDS,
    ANPR_EARLY_ACCEPT_CONFIDENCE,
    ANPR_CONSENSUS_WINDOW_SECONDS,
    ANPR_TRACK_TIMEOUT_SECONDS,
)
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("anpr_manager")


def _bbox_iou(a: PlateBBox, b: PlateBBox) -> float:
    """Intersection-over-union of two plate bboxes (0.0 when disjoint)."""
    ix1 = max(a.x1, b.x1)
    iy1 = max(a.y1, b.y1)
    ix2 = min(a.x2, b.x2)
    iy2 = min(a.y2, b.y2)
    if ix1 >= ix2 or iy1 >= iy2:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (a.x2 - a.x1) * (a.y2 - a.y1)
    area_b = (b.x2 - b.x1) * (b.y2 - b.y1)
    union = area_a + area_b - inter
    if union <= 0:
        return 0.0
    return inter / union


class AnprManager:
    def __init__(
        self,
        enabled: bool = ANPR_ENABLED,
        detector: PlateDetector | None = None,
        ocr: PlateOCR | None = None,
        confirm_reads: int = ANPR_CONFIRM_READS,
        min_ocr_confidence: float = ANPR_MIN_OCR_CONFIDENCE,
        every_n_frames: int = ANPR_PROCESS_EVERY_N_FRAMES,
        sample_target: int = 3,
    ):
        self._enabled = enabled
        self._detector = detector or PlateDetector()
        self._ocr = ocr or PlateOCR()
        self._windows = PlateSampleWindows(target=sample_target, maximum=3, confirm_reads=confirm_reads,
            minimum_confidence=min_ocr_confidence, seconds=ANPR_CONSENSUS_WINDOW_SECONDS,
            retention_seconds=ANPR_TRACK_TIMEOUT_SECONDS)
        self._lock = threading.RLock()
        self._min_ocr_confidence = min_ocr_confidence
        self._every_n_frames = max(1, every_n_frames)
        self._frame_counter = 0
        # The per-track work is already hard-bounded to three accepted source
        # frames, so an additional wall-clock cooldown would prevent consensus
        # on short vehicle passes and defeat the three-candidate window.
        self._ocr_cooldown_seconds = 0.0

        self._vehicles_evaluated = 0
        self._plate_detections = 0
        self._ocr_attempts = 0
        self._ocr_successes = 0
        self._ocr_failures = 0
        self._confirmed = 0
        self._dup_suppressed = 0
        self._plate_detect_latency_ms = deque(maxlen=300)
        self._ocr_latency_ms = deque(maxlen=300)
        self._recent_plates = {}
        self._last_ocr_at: dict[int, float] = {}
        self._confirmed_plates: dict[int, dict] = {}

    def initialize(self) -> bool:
        """Load plate detector + OCR. Returns True if at least detector ready.
        Model/OCR failures are reported but do not stop the pipeline."""
        if not self._enabled:
            return True
        det_ok = self._detector.load()
        ocr_ok = self._ocr.load()
        return bool(det_ok or ocr_ok)

    def ready(self) -> bool:
        return self._enabled and self._detector.is_loaded

    def reset(self) -> None:
        with self._lock:
            self._windows.reset()
            self._recent_plates.clear()
            self._last_ocr_at.clear()
            self._confirmed_plates.clear()
            self._frame_counter = 0
        logger.info("ANPR confirmation state reset (session change)")

    def process_frame(self, frame, vehicle_bboxes, occurred_at, source_timestamp_ms, vehicle_types=None):
        # Single owner in production; serialize callers defensively so the three
        # sample budget/finalization cannot race if called by another worker.
        with self._lock:
            return self._process_frame(frame, vehicle_bboxes, occurred_at, source_timestamp_ms, vehicle_types)

    @staticmethod
    def _retain_crop(frame, bbox, max_side=640):
        h, w = frame.shape[:2]
        x1, y1 = max(0, int(bbox["x1"])), max(0, int(bbox["y1"]))
        x2, y2 = min(w, int(bbox["x2"])), min(h, int(bbox["y2"]))
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        if max(crop.shape[:2]) > max_side:
            scale = max_side / max(crop.shape[:2])
            return cv2.resize(crop, (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale))))
        return crop.copy()

    def _observation(self, track_id, selected):
        chosen, agreeing_reads = selected
        self._confirmed += 1
        self._confirmed_plates[int(track_id)] = {
            "plate_text": chosen.normalized_text,
            "raw_text": chosen.raw_text,
            "ocr_confidence": chosen.ocr_confidence,
            "plate_detection_confidence": chosen.plate_detection_confidence,
            "occurred_at": chosen.occurred_at,
            "source_timestamp_ms": chosen.source_timestamp_ms,
            "plate_image": chosen.plate_image,
            "vehicle_image": chosen.vehicle_image,
            "vehicle_bbox": chosen.vehicle_bbox,
            "vehicle_type": chosen.vehicle_type,
        }
        return PlateObservation(
            observation_id=str(uuid.uuid4()), camera_code="", vehicle_track_id=int(track_id),
            plate_text=chosen.normalized_text, raw_text=chosen.raw_text,
            ocr_confidence=chosen.ocr_confidence,
            plate_detection_confidence=chosen.plate_detection_confidence,
            occurred_at=chosen.occurred_at, source_timestamp_ms=chosen.source_timestamp_ms,
            bbox=chosen.bbox, vehicle_type=chosen.vehicle_type, vehicle_bbox=chosen.vehicle_bbox,
            crop_quality=chosen.crop_quality, acceptance_method="BEST_SAMPLE_WINDOW",
            confirmation_reads=agreeing_reads, preprocessing_variant=chosen.preprocessing_variant,
            localization_method=chosen.detection_method,
            plate_image=chosen.plate_image, vehicle_image=chosen.vehicle_image,
        )

    def confirmed_plate(self, track_id, include_images=False):
        """Return the latest confirmed plate for a vehicle track (or None).

        Used to enrich VEHICLE risk observations (''plateText'') and to source a
        plate/vehicle snapshot when an alert requests evidence. Confirmed plates
        are retained per track until the manager is reset on reconnect.
        """
        with self._lock:
            info = self._confirmed_plates.get(int(track_id))
            if not info:
                return None
            result = {
                "vehicleTrackId": int(track_id),
                "plateText": info["plate_text"],
                "rawText": info.get("raw_text"),
                "plateConfidence": info.get("ocr_confidence"),
                "plateDetectionConfidence": info.get("plate_detection_confidence"),
                "occurredAt": info.get("occurred_at"),
                "sourceTimestampMs": info.get("source_timestamp_ms", 0),
                "vehicleType": info.get("vehicle_type"),
            }
            if include_images:
                result["plateImage"] = info.get("plate_image")
                result["vehicleImage"] = info.get("vehicle_image")
                result["vehicleBBox"] = info.get("vehicle_bbox")
            return result

    def flush(self, active_track_ids, now=None):
        with self._lock:
            now = time.monotonic() if now is None else now
            return [self._observation(tid, selected) for tid, selected in self._windows.flush(active_track_ids, now)]

    def needs_sampling(self, active_track_ids):
        with self._lock:
            return any(not self._windows.finalized(tid) for tid in active_track_ids)

    def _process_frame(self, frame, vehicle_bboxes, occurred_at, source_timestamp_ms, vehicle_types=None):
        if not self.ready():
            return []
        self._frame_counter += 1
        vehicle_types = vehicle_types or {}
        now = time.monotonic()
        active_ids = set(vehicle_bboxes)
        observations = self.flush(active_ids, now)
        accepted_regions = []
        # Sampling begins on the first eligible crop; the old modulo gate could
        # discard the first usable frame. Each track has its own finite budget.
        for track_id, vbox in vehicle_bboxes.items():
            if self._windows.finalized(track_id):
                self._dup_suppressed += 1
                continue
            # Per-track OCR cooldown bounds the (expensive) OCR cost per vehicle
            # while its sample window stays open across a long, slowly-approaching
            # pass. The window still reaches the legible frames because it is not
            # finalized early, but the plate is OCR'd at most a few times a second
            # instead of once per sampled frame.
            if now - self._last_ocr_at.get(track_id, -1e9) < self._ocr_cooldown_seconds:
                continue
            for det in sorted(self._detect(frame, vbox), key=lambda item: item.confidence, reverse=True):
                self._plate_detections += 1
                if any(_bbox_iou(det.bbox, other) > ANPR_DUP_IOU_THRESHOLD for other in accepted_regions):
                    self._dup_suppressed += 1
                    continue
                crop, quality = assess_crop(frame, det.bbox, kind="plate")
                if crop is None or not quality["accepted"]:
                    logger.debug(
                        "ANPR_STAGE track=%s stage=CROP_QUALITY status=REJECTED reasons=%s quality=%s",
                        track_id, quality.get("reasons", []), quality,
                    )
                    continue
                accepted_regions.append(det.bbox)
                self._ocr_attempts += 1
                self._last_ocr_at[track_id] = now
                crop = deskew_plate_crop(crop, getattr(det, "angle", 0.0))
                _, enhanced = preprocess_plate_crop(crop)
                variant = "enhanced"
                read = self._ocr.read(enhanced, latency_ms=self._ocr_latency_ms)
                if read.raw_text is None:
                    read = self._ocr.read(crop, latency_ms=self._ocr_latency_ms)
                    variant = "original"
                norm = normalize_plate_text(read.raw_text)
                validation = validate_plate(norm, read.ocr_confidence, self._min_ocr_confidence)
                valid = validation == VALID_FORMAT
                logger.info(
                    "ANPR_STAGE track=%s stage=OCR raw=%r normalized=%r confidence=%.3f "
                    "validation=%s cropQuality=%.3f detectorConfidence=%.3f variant=%s",
                    track_id, read.raw_text, norm, read.ocr_confidence, validation,
                    quality.get("score", 0.0), det.confidence, variant,
                )
                self._ocr_successes += int(valid)
                self._ocr_failures += int(not valid)
                candidate = PlateCandidate(
                    raw_text=read.raw_text or "", normalized_text=norm or "",
                    ocr_confidence=read.ocr_confidence, plate_detection_confidence=det.confidence,
                    bbox=det.bbox, quality_score=quality["score"], occurred_at=occurred_at,
                    source_timestamp_ms=int(source_timestamp_ms), vehicle_bbox=dict(vbox),
                    vehicle_type=vehicle_types.get(track_id), crop_quality=quality,
                    preprocessing_variant=variant,
                    detection_method=getattr(det, "method", "STRUCTURAL"),
                    plate_image=crop.copy() if valid else None,
                    vehicle_image=self._retain_crop(frame, vbox) if valid else None,
                )
                self._vehicles_evaluated += 1
                # Budget conservation: a read with no plate-like content (empty,
                # a stray glyph, or sub-noise confidence) does not consume the
                # track's finite sample budget. A distant/unreadable phase must
                # not silently burn the window before the plate becomes legible.
                if not (norm and len(norm) >= 4 and read.ocr_confidence >= 0.25):
                    continue
                selected = self._windows.add(track_id, candidate, now)
                if selected:
                    observations.append(self._observation(track_id, selected))
                # At most one good source-frame sample per vehicle per call.
                # OCR variants of this crop are not independent votes.
                break
        return observations

    def _detect(self, frame: np.ndarray, vbox: dict):
        start = time.time()
        try:
            dets = self._detector.detect(frame, vbox)
        except Exception as e:  # noqa: BLE001
            logger.error("Plate detect error: %s", e)
            return []
        finally:
            self._plate_detect_latency_ms.append(round((time.time() - start) * 1000, 2))
        return dets

    def has_pending_confirmation(self) -> bool:
        with self._lock:
            return self._windows.pending()

    def get_stats(self) -> dict:
        def avg(xs):
            return round(sum(xs) / len(xs), 2) if xs else 0.0

        if not self._enabled:
            status = "DISABLED"
        elif not self._detector.is_loaded or not self._ocr.is_loaded:
            status = "ERROR"
        elif self._detector.mode == "MODEL":
            status = "READY"
        else:
            # A bbox heuristic can support development experiments, but it is
            # not a dedicated plate detector and must never be presented as a
            # fully ready ANPR pipeline in health/demo status.
            status = "DEGRADED"

        detector_info = getattr(self._detector, "get_info", lambda: {})()
        return {
            "enabled": self._enabled,
            "detectorLoaded": self._detector.is_loaded,
            "detectorMode": self._detector.mode,
            "detectorLocalization": detector_info.get("localization"),
            "status": status,
            "ocrLoaded": self._ocr.is_loaded,
            "ocrStatus": self._ocr.status,
            "vehiclesEvaluated": self._vehicles_evaluated,
            "plateDetections": self._plate_detections,
            "ocrAttempts": self._ocr_attempts,
            "ocrSuccesses": self._ocr_successes,
            "ocrFailures": self._ocr_failures,
            "confirmedObservations": self._confirmed,
            "duplicateSuppressed": self._dup_suppressed,
            "averagePlateDetectionLatencyMs": avg(self._plate_detect_latency_ms),
            "averageOcrLatencyMs": avg(self._ocr_latency_ms),
            "state": {"activeTracks": len(self._windows.states),
                      "finalized": sum(s.finalized for s in self._windows.states.values()),
                      "sampleTarget": self._windows.target, "sampleMaximum": self._windows.maximum},
        }
