"""JPEG write helpers for snapshot-oriented evidence capture (Phase 11)."""
from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

import cv2

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _storage_reference(evidence_id: str, ext: str, subdir: str) -> str:
    # Relative path under the shared storage root.
    return f"storage/{subdir}/{evidence_id}{ext}"


def capture_snapshot(
    frame,
    evidence_id: str,
    snapshots_dir: Path,
    subdir: str = "snapshots",
) -> dict:
    """Write a single annotated frame as a JPEG snapshot.

    Returns a metadata dict (storageReference, mimeType, fileSizeBytes,
    checksum) ready for the Node evidence payload, or None if the frame is bad.
    """
    if frame is None:
        return None

    snapshots_dir = Path(snapshots_dir)
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    rel = _storage_reference(evidence_id, ".jpg", subdir)
    path = snapshots_dir / f"{evidence_id}.jpg"

    ok, buf = cv2.imencode(".jpg", frame)
    if not ok:
        return None
    # Deterministic incident snapshot IDs make retries idempotent. Publish once
    # so a later retry cannot replace the selected winner while the database
    # still carries its original checksum.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=snapshots_dir, suffix=".tmp", delete=False) as output:
            temporary = output.name
            output.write(buf.tobytes())
        try:
            os.link(temporary, path)
        except FileExistsError:
            pass
    finally:
        if temporary is not None:
            os.unlink(temporary)
    size = path.stat().st_size

    return {
        "type": "SNAPSHOT",
        "storageReference": rel,
        "mimeType": "image/jpeg",
        "fileSizeBytes": size,
        "checksum": _sha256(path),
    }


def capture_face_crop(
    frame,
    bbox: dict,
    evidence_id: str,
    faces_dir: Path,
    subdir: str = "faces",
    margin_frac: float = 0.25,
    max_side: int = 256,
) -> dict:
    """Write a cropped face JPEG from the full frame.

    bbox uses full-frame pixel coordinates (x1, y1, x2, y2); it is clamped to
    the frame, padded by margin_frac, and downscaled to at most max_side px.
    Returns metadata identical to capture_snapshot but with type "FACE", or
    None when the frame or bbox is unusable.
    """
    if frame is None or bbox is None:
        return None

    h, w = frame.shape[:2]
    x1 = max(0, int(bbox.get("x1", 0)))
    y1 = max(0, int(bbox.get("y1", 0)))
    x2 = min(w, int(bbox.get("x2", 0)))
    y2 = min(h, int(bbox.get("y2", 0)))
    if x2 <= x1 or y2 <= y1:
        return None

    bw, bh = x2 - x1, y2 - y1
    pad_x = int(bw * margin_frac)
    pad_y = int(bh * margin_frac)
    crop = frame[max(0, y1 - pad_y):min(h, y2 + pad_y), max(0, x1 - pad_x):min(w, x2 + pad_x)]
    if crop.size == 0 or crop.shape[0] < 1 or crop.shape[1] < 1:
        return None

    ch, cw = crop.shape[:2]
    scale = max_side / max(ch, cw)
    if scale < 1.0:
        crop = cv2.resize(
            crop,
            (max(1, int(cw * scale)), max(1, int(ch * scale))),
            interpolation=cv2.INTER_AREA,
        )

    faces_dir = Path(faces_dir)
    faces_dir.mkdir(parents=True, exist_ok=True)
    rel = _storage_reference(evidence_id, ".jpg", subdir)
    path = faces_dir / f"{evidence_id}.jpg"

    ok, buf = cv2.imencode(".jpg", crop)
    if not ok:
        return None
    # Publish the complete JPEG atomically without replacing an earlier capture
    # with the same id. Metadata retries must keep the original bytes/checksum.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=faces_dir, suffix=".tmp", delete=False) as output:
            temporary = output.name
            output.write(buf.tobytes())
        try:
            os.link(temporary, path)
        except FileExistsError:
            pass
    finally:
        if temporary is not None:
            os.unlink(temporary)
    size = path.stat().st_size

    return {
        "type": "FACE",
        "storageReference": rel,
        "mimeType": "image/jpeg",
        "fileSizeBytes": size,
        "checksum": _sha256(path),
    }
