from types import SimpleNamespace

import numpy as np

from anpr.models import PlateBBox
from evidence.manager import EvidenceManager
from evidence.recorder import capture_face_crop


def test_retry_of_stable_crop_id_does_not_overwrite_original_evidence(tmp_path):
    bbox = {"x1": 10, "y1": 10, "x2": 70, "y2": 70}
    first = capture_face_crop(np.full((100, 100, 3), 80, np.uint8), bbox, "stable", tmp_path)
    second = capture_face_crop(np.full((100, 100, 3), 180, np.uint8), bbox, "stable", tmp_path)
    assert first == second
    assert list(tmp_path.glob("*.tmp")) == []


def test_plate_and_vehicle_evidence_share_event_and_capture_time(tmp_path, monkeypatch):
    monkeypatch.setattr("evidence.manager.EVIDENCE_DIR", tmp_path)
    manager = EvidenceManager(enabled=True)
    observation = SimpleNamespace(
        bbox=PlateBBox(20, 30, 100, 50),
        vehicle_bbox={"x1": 10, "y1": 10, "x2": 140, "y2": 90},
        occurred_at="2026-09-11T00:00:00Z",
    )
    frame = np.random.default_rng(7).integers(40, 210, (100, 160, 3), dtype=np.uint8)
    items = manager.capture_plate_evidence(frame, observation, "event-one")
    assert {item.type for item in items} == {"PLATE", "VEHICLE"}
    assert all(item.event_id == "event-one" and item.captured_at == observation.occurred_at for item in items)
    assert all(item.checksum and item.file_size_bytes > 0 for item in items)
    again = manager.capture_plate_evidence(frame, observation, "event-one")
    assert [item.evidence_id for item in items] == [item.evidence_id for item in again]


def test_incident_plate_evidence_does_not_duplicate_vehicle_snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr("evidence.manager.EVIDENCE_DIR", tmp_path)
    manager = EvidenceManager(enabled=True)
    observation = SimpleNamespace(
        bbox=PlateBBox(20, 30, 100, 50),
        vehicle_bbox={"x1": 10, "y1": 10, "x2": 140, "y2": 90},
        occurred_at="2026-09-11T00:00:00Z",
    )
    frame = np.random.default_rng(8).integers(40, 210, (100, 160, 3), dtype=np.uint8)
    items = manager.capture_plate_evidence(frame, observation, "incident-one", include_vehicle=False)
    assert [item.type for item in items] == ["PLATE"]
