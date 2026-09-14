"""Evidence capture orchestration (Phase 11).

Holds a bounded annotated-frame buffer, retains at most three useful vehicle
candidates in memory, and writes one selected snapshot. Evidence failure must
never cancel alert creation — it is best-effort, logged, and non-fatal.
"""
from __future__ import annotations

import time
import uuid

import cv2

from config import (
    EVIDENCE_ENABLED,
    EVIDENCE_MIME_SNAPSHOT,
    EVIDENCE_POST_SECONDS,
    EVIDENCE_PRE_SECONDS,
    FACE_DIR,
    EVIDENCE_DIR,
    FRAME_SAMPLE_FPS,
    SNAPSHOT_DIR,
)
from evidence.buffer import BufferedFrame, FrameRingBuffer
from evidence.models import EvidenceMeta, build_payload
from evidence.recorder import capture_face_crop, capture_snapshot
from utils.logger import get_logger
from utils.time import utc_iso

logger = get_logger("evidence")

SNAPSHOT = "SNAPSHOT"
FACE = "FACE"


class EvidenceManager:
    """Best-effort evidence capture triggered by Node alert decisions."""

    def __init__(
        self,
        enabled: bool = EVIDENCE_ENABLED,
        snapshot_dir=SNAPSHOT_DIR,
        clip_dir=None,
        face_dir=FACE_DIR,
        sample_fps: int = FRAME_SAMPLE_FPS,
        maxlen: int | None = None,
    ):
        self._enabled = enabled
        self._snapshot_dir = snapshot_dir
        self._face_dir = face_dir
        self._sample_fps = max(int(sample_fps), 1)
        if maxlen is None:
            maxlen = int(self._sample_fps * (EVIDENCE_PRE_SECONDS + EVIDENCE_POST_SECONDS)) + 2
        self._ring = FrameRingBuffer(maxlen=maxlen)
        self._captured_count = 0
        self._failed_count = 0
        # Candidate pixels stay in memory only. At most three frames are held
        # for each vehicle track and exactly one winner may be written.
        self._vehicle_candidates: dict[int, list[dict]] = {}
        self._incident_snapshots: dict[str, EvidenceMeta] = {}

    @property
    def enabled(self) -> bool:
        return self._enabled

    def record_frame(
        self, image, captured_at: float, source_timestamp_ms: float, frame_index: int,
        vehicle_tracks: list[dict] | None = None,
    ) -> None:
        """Push an annotated frame into the ring buffer for later capture."""
        if not self._enabled:
            return
        self._ring.push(BufferedFrame(
            image=image,
            captured_at=captured_at,
            source_timestamp_ms=source_timestamp_ms,
            frame_index=frame_index,
        ))
        self._record_vehicle_candidates(
            image, captured_at, source_timestamp_ms, frame_index, vehicle_tracks or []
        )

    @staticmethod
    def _vehicle_candidate_score(image, bbox: dict) -> tuple[float, dict] | None:
        """Rank a still without claiming that a heuristic region is a plate."""
        if image is None or not bbox:
            return None
        h, w = image.shape[:2]
        x1, y1 = max(0, int(bbox.get("x1", 0))), max(0, int(bbox.get("y1", 0)))
        x2, y2 = min(w, int(bbox.get("x2", 0))), min(h, int(bbox.get("y2", 0)))
        if x2 <= x1 or y2 <= y1:
            return None
        vehicle = image[y1:y2, x1:x2]
        if vehicle.size == 0:
            return None
        gray = cv2.cvtColor(vehicle, cv2.COLOR_BGR2GRAY) if vehicle.ndim == 3 else vehicle
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(gray.mean())
        # Ideal exposure is deliberately broad. This rejects neither night nor
        # daylight frames; it only breaks ties against crushed/blown candidates.
        brightness_score = max(0.0, 1.0 - abs(brightness - 128.0) / 128.0)
        area_fraction = ((x2 - x1) * (y2 - y1)) / max(float(w * h), 1.0)
        vehicle_visibility = min(1.0, area_fraction / 0.20)
        clipped = x1 <= 1 or y1 <= 1 or x2 >= w - 1 or y2 >= h - 1

        vh, vw = gray.shape[:2]
        # A conservative lower-centre region is used only to measure whether a
        # plate-sized textured area is visible; ANPR remains the plate authority.
        px1, px2 = int(vw * 0.2), max(int(vw * 0.8), 1)
        py1, py2 = int(vh * 0.5), max(int(vh * 0.9), 1)
        plate_region = gray[py1:py2, px1:px2]
        if plate_region.size:
            plate_sharpness = float(cv2.Laplacian(plate_region, cv2.CV_64F).var())
            plate_contrast = float(plate_region.std())
            size_visibility = min(1.0, min(plate_region.shape[:2]) / 30.0)
        else:
            plate_sharpness = plate_contrast = size_visibility = 0.0
        sharpness_score = min(1.0, sharpness / 500.0)
        plate_visibility = (
            0.45 * min(1.0, plate_sharpness / 350.0)
            + 0.35 * min(1.0, plate_contrast / 64.0)
            + 0.20 * size_visibility
        )
        score = (
            0.35 * sharpness_score
            + 0.30 * plate_visibility
            + 0.15 * brightness_score
            + 0.15 * vehicle_visibility
            + 0.05 * (0.0 if clipped else 1.0)
        )
        return score, {
            "sharpness": round(sharpness, 2),
            "motionBlurScore": round(sharpness_score, 4),
            "plateVisibility": round(plate_visibility, 4),
            "brightness": round(brightness, 2),
            "brightnessScore": round(brightness_score, 4),
            "vehicleVisibility": round(vehicle_visibility, 4),
            "clipped": clipped,
            "score": round(score, 4),
        }

    def _record_vehicle_candidates(self, image, captured_at, source_timestamp_ms, frame_index, tracks):
        for track in tracks:
            if str(track.get("objectType", "")).upper() != "VEHICLE":
                continue
            track_id = track.get("trackId")
            if track_id is None:
                continue
            ranked = self._vehicle_candidate_score(image, track.get("bbox") or {})
            if ranked is None:
                continue
            score, quality = ranked
            candidate = {
                "image": image.copy(), "capturedAt": captured_at,
                "sourceTimestampMs": source_timestamp_ms, "frameIndex": frame_index,
                "score": score, "quality": quality,
            }
            candidates = self._vehicle_candidates.setdefault(int(track_id), [])
            if len(candidates) < 3:
                candidates.append(candidate)
            else:
                worst = min(range(len(candidates)), key=lambda index: candidates[index]["score"])
                if score > candidates[worst]["score"]:
                    candidates[worst] = candidate

    def clear(self) -> None:
        self._ring.clear()
        self._vehicle_candidates.clear()

    def get_stats(self) -> dict:
        return {
            "enabled": self._enabled,
            "ringBuffer": self._ring.get_stats(),
            "captured": self._captured_count,
            "failed": self._failed_count,
            "vehicleCandidateTracks": len(self._vehicle_candidates),
            "vehicleCandidates": sum(len(items) for items in self._vehicle_candidates.values()),
            "preSeconds": EVIDENCE_PRE_SECONDS,
            "postSeconds": EVIDENCE_POST_SECONDS,
            "sampleFps": self._sample_fps,
        }

    def build_evidence_items(
        self,
        alert_action: dict,
        risk_obs: dict | None,
    ) -> list[EvidenceMeta]:
        """Capture one snapshot for a non-incident alert action.

        Returns an empty list when evidence is disabled, no match/request, or
        capture failed (evidence failure never cancels the alert).
        """
        if not self._enabled:
            return []
        if not alert_action.get("evidenceRequested"):
            return []
        alert_id = alert_action.get("alertId")
        if not alert_id:
            return []

        target_ms = (risk_obs or {}).get("sourceTimestampMs")
        captured_at = (risk_obs or {}).get("occurredAt") or utc_iso()

        items: list[EvidenceMeta] = []
        snap_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ibvap:{alert_id}:BEST_SNAPSHOT"))
        snapshot_frame = self._ring.snapshot_frame(target_ms)
        track_id = (risk_obs or {}).get("trackId")
        if track_id is not None:
            candidates = self._vehicle_candidates.get(int(track_id), [])
            if candidates:
                winner = max(candidates, key=lambda candidate: candidate["score"])
                snapshot_frame = winner["image"]
        snapshot = capture_snapshot(
            snapshot_frame,
            snap_id,
            self._snapshot_dir,
        )
        if snapshot:
            snapshot_item = EvidenceMeta(
                evidence_id=snap_id,
                alert_id=alert_id,
                alert_code=alert_action.get("alertCode"),
                type=SNAPSHOT,
                storage_reference=snapshot["storageReference"],
                mime_type=EVIDENCE_MIME_SNAPSHOT,
                file_size_bytes=snapshot["fileSizeBytes"],
                checksum=snapshot["checksum"],
                captured_at=captured_at,
            )
            items.append(snapshot_item)
        else:
            self._failed_count += 1
            logger.warning("Snapshot capture failed for alert %s", alert_id)

        self._captured_count += len(items)
        return items

    def build_incident_snapshot(self, event_code: str, risk_obs: dict | None) -> EvidenceMeta | None:
        """Write exactly one best still for a restricted vehicle incident."""
        if not self._enabled or not event_code:
            return None
        if event_code in self._incident_snapshots:
            return self._incident_snapshots[event_code]
        target_ms = (risk_obs or {}).get("sourceTimestampMs")
        frame = self._ring.snapshot_frame(target_ms)
        track_id = (risk_obs or {}).get("trackId")
        quality = None
        if track_id is not None:
            candidates = self._vehicle_candidates.get(int(track_id), [])
            if candidates:
                winner = max(candidates, key=lambda candidate: candidate["score"])
                frame = winner["image"]
                quality = winner["quality"]
        evidence_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ibvap:{event_code}:BEST_SNAPSHOT"))
        media = capture_snapshot(frame, evidence_id, self._snapshot_dir)
        if not media:
            self._failed_count += 1
            logger.warning("Best snapshot unavailable for incident %s", event_code)
            return None
        item = EvidenceMeta(
            evidence_id=evidence_id,
            event_id=event_code,
            type=SNAPSHOT,
            storage_reference=media["storageReference"],
            mime_type=EVIDENCE_MIME_SNAPSHOT,
            file_size_bytes=media["fileSizeBytes"],
            checksum=media["checksum"],
            captured_at=(risk_obs or {}).get("occurredAt") or utc_iso(),
        )
        self._incident_snapshots[event_code] = item
        self._captured_count += 1
        logger.info("Best incident snapshot selected event=%s track=%s quality=%s", event_code, track_id, quality)
        return item

    def build_plate_evidence_items(
        self,
        alert_action: dict,
        risk_obs: dict | None,
        plate_info: dict | None,
    ) -> list[EvidenceMeta]:
        """Capture the one confirmed plate crop for a vehicle alert action.

        The vehicle still is selected separately by ``build_evidence_items``.
        """
        if not self._enabled or not plate_info:
            return []
        if not alert_action.get("evidenceRequested"):
            return []
        alert_id = alert_action.get("alertId")
        if not alert_id:
            return []
        captured_at = (
            (risk_obs or {}).get("occurredAt")
            or plate_info.get("occurredAt")
            or utc_iso()
        )
        items: list[EvidenceMeta] = []
        for evidence_type, key, subdir in (("PLATE", "plateImage", "plates"),):
            image = plate_info.get(key)
            if image is None:
                continue
            evidence_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ibvap:{alert_id}:BEST_PLATE"))
            try:
                media = capture_face_crop(
                    image,
                    {"x1": 0, "y1": 0, "x2": image.shape[1], "y2": image.shape[0]},
                    evidence_id,
                    EVIDENCE_DIR / subdir,
                    subdir=subdir,
                    margin_frac=0,
                    max_side=1280,
                )
            except Exception as exc:  # best-effort capture must never raise
                self._failed_count += 1
                logger.warning(
                    "Plate evidence write failed for alert %s (%s)",
                    alert_id, type(exc).__name__,
                )
                continue
            if not media:
                continue
            items.append(EvidenceMeta(
                evidence_id=evidence_id,
                alert_id=alert_id,
                alert_code=alert_action.get("alertCode"),
                type=evidence_type,
                storage_reference=media["storageReference"],
                mime_type=EVIDENCE_MIME_SNAPSHOT,
                file_size_bytes=media["fileSizeBytes"],
                checksum=media["checksum"],
                captured_at=captured_at,
            ))
        if items:
            self._captured_count += len(items)
        return items

    def capture_face_evidence(
        self,
        frame,
        bbox: dict,
        event_id: str,
        captured_at: str | None = None,
        evidence_ordinal: int = 1,
    ) -> EvidenceMeta | None:
        """Crop + save a face from the full frame as event-anchored evidence.

        Attachment to a delivered face observation is best-effort: failure never
        affects the observation itself. Returns None when disabled or unusable.
        """
        if not self._enabled or not bbox or not event_id:
            return None
        face_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ibvap:{event_id}:FACE:{evidence_ordinal}"))
        try:
            crop = capture_face_crop(frame, bbox, face_id, self._face_dir)
        except Exception as e:  # best-effort capture must never raise
            self._failed_count += 1
            logger.warning("Face crop capture failed for event %s: %s", event_id, e)
            return None
        if not crop:
            self._failed_count += 1
            logger.warning("Face crop unavailable for event %s", event_id)
            return None
        self._captured_count += 1
        return EvidenceMeta(
            evidence_id=face_id,
            alert_id=None,
            alert_code=None,
            event_id=event_id,
            type=FACE,
            storage_reference=crop["storageReference"],
            mime_type=EVIDENCE_MIME_SNAPSHOT,
            file_size_bytes=crop["fileSizeBytes"],
            checksum=crop["checksum"],
            captured_at=captured_at or utc_iso(),
        )

    def capture_plate_evidence(self, frame, observation, event_code, include_vehicle: bool = True):
        """Save the winning sample's pixels, not a later finalization frame.

        Uses the retained accepted plate crop so evidence matches the confirmed
        OCR result. The vehicle image is supplied by the incident/alert snapshot
        path and is never duplicated here.
        """
        if not self._enabled or not event_code:
            return []
        items = []
        targets = [("PLATE", observation.bbox.to_dict(), "plates")]
        if include_vehicle:
            targets.append(("VEHICLE", observation.vehicle_bbox, "vehicles"))
        for evidence_type, bbox, subdir in targets:
            if not bbox:
                continue
            evidence_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"ibvap:{event_code}:{evidence_type}"))
            retained = getattr(observation, "plate_image" if evidence_type == "PLATE" else "vehicle_image", None)
            evidence_frame = frame
            if retained is not None:
                evidence_frame = retained
                bbox = {"x1": 0, "y1": 0, "x2": retained.shape[1], "y2": retained.shape[0]}
            elif evidence_frame is None:
                continue
            try:
                media = capture_face_crop(evidence_frame, bbox, evidence_id, EVIDENCE_DIR / subdir,
                                          subdir=subdir, margin_frac=0, max_side=1280)
                if media:
                    items.append(EvidenceMeta(
                        evidence_id=evidence_id, event_id=event_code, type=evidence_type,
                        storage_reference=media["storageReference"], mime_type=EVIDENCE_MIME_SNAPSHOT,
                        file_size_bytes=media["fileSizeBytes"], checksum=media["checksum"],
                        captured_at=observation.occurred_at,
                    ))
            except Exception as exc:
                self._failed_count += 1
                logger.warning("Plate evidence write failed (%s)", type(exc).__name__)
        self._captured_count += len(items)
        return items

    async def handle_alert_actions(
        self, alert_actions: list[dict], risk_obs_by_id: dict, node_client, camera_code: str,
        plate_by_obs: dict | None = None,
    ) -> dict:
        """Capture + deliver evidence for all evidence-requested alert actions."""
        delivered = 0
        failed = 0
        for action in alert_actions or []:
            obs_id = action.get("observationId")
            risk_obs = risk_obs_by_id.get(obs_id)
            reasons = (risk_obs or {}).get("reasons") or []
            restricted = any(
                str(reason if isinstance(reason, str) else reason.get("code") or reason.get("type") or "").upper()
                == "RESTRICTED_ZONE_ENTRY" for reason in reasons
            )
            # Restricted incidents are event-anchored as soon as Node returns
            # the binding, including LOW incidents that have no alert yet.
            items = [] if restricted else self.build_evidence_items(action, risk_obs)
            if not restricted:
                items += self.build_plate_evidence_items(
                    action, risk_obs, (plate_by_obs or {}).get(obs_id)
                )
            if not items:
                if action.get("evidenceRequested") and not self._enabled:
                    failed += 1
                continue
            if not node_client.is_enabled:
                logger.info("Node integration disabled — evidence captured locally (%d)", len(items))
                delivered += len(items)
                continue
            try:
                result = await node_client.send_evidence(camera_code, items)
                if result.get("sent"):
                    delivered += 1
                    logger.info("Evidence delivered for alert %s (%d items)", action.get("alertId"), len(items))
                else:
                    failed += 1
                    logger.warning("Evidence delivery failed for alert %s: %s", action.get("alertId"), result.get("error"))
            except Exception as e:  # evidence failure must not cancel alerting
                failed += 1
                logger.warning("Evidence delivery error for alert %s: %s", action.get("alertId"), e)
        return {"delivered": delivered, "failed": failed}
