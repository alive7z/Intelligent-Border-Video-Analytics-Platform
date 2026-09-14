"""Read-only local dependency/weight checks; no camera access or downloads."""
import os
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from config import (
    ANPR_MODEL_PATH,
    EVIDENCE_DIR,
    FACE_DIR,
    FACE_MODEL_PATH,
    SNAPSHOT_DIR,
    WEIGHTS_DIR,
    YOLO_MODEL,
)


def _weight_exists(configured: str) -> bool:
    return any(p.is_file() for p in (Path(configured), WEIGHTS_DIR / configured))


def main():
    missing = False
    for package in ("fastapi", "opencv-python", "ultralytics", "torch", "easyocr"):
        try:
            print(f"PASS dependency: {package} {version(package)}")
        except PackageNotFoundError:
            print(f"MISSING dependency: {package}")
            missing = True

    hard = (("YOLO", YOLO_MODEL), ("YuNet", FACE_MODEL_PATH))
    for label, configured in hard:
        present = _weight_exists(configured)
        print(f"{'PRESENT' if present else 'MISSING'} local weights: {label}")
        missing |= not present

    # Dedicated plate detector is intentionally optional: without weights ANPR
    # degrades to the documented heuristic plate localization, so its absence is
    # a DEGRADED warning, not a startup blocker.
    print(
        f"{'PRESENT' if _weight_exists(ANPR_MODEL_PATH) else 'MISSING'} "
        f"local weights: Dedicated plate detector ({ANPR_MODEL_PATH})"
    )
    if not _weight_exists(ANPR_MODEL_PATH):
        print("DEGRADED: ANPR will run in HEURISTIC plate-localization mode.")

    # Evidence directories must exist and be writable before the first incident;
    # a read-only mount would otherwise fail silently at capture time.
    degraded = False
    for label, d in (("EVIDENCE_ROOT", EVIDENCE_DIR), ("SNAPSHOT", SNAPSHOT_DIR),
                     ("FACE", FACE_DIR)):
        try:
            d.mkdir(parents=True, exist_ok=True)
            writable = os.access(d, os.W_OK)
            print(f"{'READY' if writable else 'NOT_WRITABLE'} evidence dir: {label} -> {d}")
            degraded |= not writable
        except OSError as exc:
            print(f"NOT_WRITABLE evidence dir: {label} -> {d} ({exc})")
            degraded = True

    print("Weight presence is not inference verification or an accuracy measurement.")
    print("Missing dedicated plate weights mean DEGRADED development heuristic mode.")
    if degraded:
        print("DEGRADED: evidence storage is not writable; evidence capture will be disabled.")
    return int(missing)


if __name__ == "__main__":
    raise SystemExit(main())
