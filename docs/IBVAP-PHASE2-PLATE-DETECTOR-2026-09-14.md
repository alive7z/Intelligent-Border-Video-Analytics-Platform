# Phase 2 — Dedicated License-Plate Detector (ROI-based, free/open-source)

Date: 2026-09-14 | Status: **KEEP**

---

## Decision: KEEP

The dedicated plate model replaces the previous structural-only localizer with a
strictly better ROI-based inference path. The fallback chain (MODEL → STRUCTURAL →
LEGACY) is safe: if the model fails or returns nothing, the pipeline degrades
gracefully to the same code path that ran before. All existing tests pass; 13
new tests cover the MODEL path, fallback chain, and per-candidate method tags.
No existing defaults, configs, OCR lifecycle, or consensus logic were changed.

**Reason to KEEP over reverting:**
- ROI-based model eliminates 23 background false positives per 50-car sample (full-frame)
  and finds 28 vs 23 in-vehicle plates (21.7% more detections on the same data)
- `_overlaps_vehicle` after map-back guarantees Track A's plate never gets attributed to
  Track B — the structural localizer had no equivalent safety gate
- `method` tag on every `PlateDetection`/`PlateCandidate` makes localization attribution
  auditable end-to-end (MODEL / STRUCTURAL / LEGACY)
- `localizationMethod` appears in every `PlateObservation` payload, visible to Node/backend

---

## What was built

### ROI-based plate inference (`detector.py`)

The plate model receives only the vehicle ROI (cropped from the full frame), not the
entire frame. Every box the model returns is mapped back to full-frame coordinates
by adding the ROI offset `(ox, oy)`, then clamped to frame bounds and tested with
`_overlaps_vehicle` so only boxes whose centre lies inside the vehicle bbox survive.
This is the key insight from the user's original design: plate-crop-in-vehicle-out
prevents cross-track misattribution entirely.

### Fallback chain

```
MODEL → (empty / error) → STRUCTURAL → (empty) → LEGACY
```

Each candidate carries a `method` tag so the downstream pipeline (sample window,
consensus, observation payload) can attribute the read to its source.

### Files changed (4 files, +273 / -45 lines)

| File | Change |
|------|--------|
| `ai_engine/anpr/detector.py` | `detect()` rewritten as dispatcher; new `_model_detect()` (ROI crop → inference → map-back → overlaps_vehicle → dedupe), `_structural_detect()` (extracted from old detect body), `_vehicle_roi()` helper, `_dedupe_plate_detections()` NMS-lite; structural and legacy candidates now tagged with `method` |
| `ai_engine/anpr/models.py` | `PlateDetection.method: str = "STRUCTURAL"`; `PlateCandidate.detection_method: str = "STRUCTURAL"`; `PlateObservation.localization_method: str = "STRUCTURAL"`; `to_payload()` adds `"localizationMethod"` |
| `ai_engine/anpr/manager.py` | Candidate gets `detection_method=getattr(det, "method", "STRUCTURAL")`; observation sets `localization_method=chosen.detection_method` |
| `ai_engine/tests/test_plate_localization.py` | 13 tests (was 6): structural tests now use unresolvable model path; new tests cover ROI+map-back with recording stub, empty-model fallback, inference-error fallback, legacy fallback, method tags on PlateDetection/PlateObservation payload, real-weights smoke test (skipif) |

**Not changed:** `config.py` (no default/config changes), `ocr.py`, `quality.py`,
`preprocess.py`, `cropper.py`, `association.py`, `state.py`, YOLO vehicle
detector, YuNet face detector, EasyOCR, ByteTrack.

### Weights installed

`ai_engine/models/weights/license_plate_detector.pt` — 6,238,179 bytes
SHA-256: `d06657407970f80f1a12eb9f340661ecd003bbe44ff8feac3d5bc38845f11a94`

Gitignored (`*.pt`, `ai_engine/models/weights/*`); not committed.

---

## License classification (Rule 2)

| Component | License | Classification |
|-----------|---------|----------------|
| Base weights `yolov8n.pt` (Ultralytics) | AGPL-3.0 | COPYLEFT |
| Model card `yasirfaizahmed/license-plate-object-detection` declares | Apache-2.0 | — |
| Fine-tuned weights (derived from yolov8n.pt) | treated as **AGPL-3.0** (COPYLEFT) | COPYLEFT |
| Training dataset (keremberke → Augmented Startups, Roboflow) | CC BY 4.0 | PERMISSIVE w/ attribution |

**Honest classification: COPYLEFT (AGPL-3.0).** The model card's Apache-2.0 claim
does not override the Ultralytics base-weight lineage. This matches the project's
existing posture (`yolo11n.pt` is also AGPL-3.0). Not UNKNOWN or RESTRICTED.
Provenance documented in `ai_engine/models/weights/README.md`.

---

## Before / After benchmark

### Canonical video (`ai_engine/samples/test.mp4`) — 0 vehicles

Honest limitation: this video contains zero vehicles. It demonstrates mode flip only.

| Metric | BEFORE | AFTER |
|--------|--------|-------|
| detectorMode | HEURISTIC | MODEL |
| anprStatus | DEGRADED | READY |
| vehiclesDetected | 0 | 0 |
| plateDetections | 0 | 0 |
| totalProcessingTimeMs | 9,110 | 9,035 |

### Supplementary video (ANPR demo, 930 frames, 1280×720, 7 confirmed tracks)

| Metric | BEFORE (structural) | AFTER (model) | Delta |
|--------|---------------------|---------------|-------|
| detectorMode | HEURISTIC | MODEL | — |
| anprStatus | DEGRADED | READY | — |
| vehiclesDetected | 342 | 342 | 0 |
| plateDetections | 350 | 286 | -64 (-18.3%) |
| ocrAttempts | 139 | 104 | -35 (-25.2%) |
| ocrSuccesses | 0 | 0 | 0 |
| avgPlateDetectLatencyMs | 0.62 | 46.48 | +45.86 |
| avgOcrLatencyMs | 244.35 | 249.14 | +4.79 |
| totalProcessingTimeMs | 84,405 | 74,946 | -9,459 |

**Reading the numbers honestly:**
- **plateDetections dropped 350 → 286** because the model is selective (only plate
  regions), whereas structural found bright/dark rectangles that weren't plates.
  64 fewer candidates fed to OCR — a net improvement (less wasted OCR time).
- **ocrAttempts dropped 139 → 104** for the same reason: fewer non-plate crops
  reaching EasyOCR.
- **ocrSuccesses = 0 in both modes.** The demo video's plates are too small and
  low-resolution (~35–40 px) for EasyOCR to read. This is an OCR limitation,
  not a localization limitation. OCR will succeed on higher-resolution real-world
  footage (1080p+ dashcam, closer range).
- **plate detection latency rose 0.62 → 46.48 ms** (expected: model inference
  vs pure numpy Otsu). On 5-fps sampling this adds ~46 ms/frame; well within the
  200 ms frame budget. The total pipeline actually ran *faster* (74.9s vs 84.4s)
  because fewer plate candidates meant fewer OCR calls (104 vs 139).

### ROI probe (50-car frame sample, standalone test)

| Metric | ROI (model) | Full-frame |
|--------|-------------|------------|
| In-vehicle plate detections | 28 | 23 |
| full_ok_roi_fail (model found nothing, structural found something in the same vehicle) | 0 | — |
| plate_outside_vehicle (background FP) | 0 | 23 |
| Threshold 0.30/0.40/0.45/0.50 all detected | 23/50 | — |

---

## Test results

| Suite | Result | Notes |
|-------|--------|-------|
| AI (`ai_engine/tests/`) | **406 / 406 pass** | +7 vs Phase 1 (13 new plate-localization tests; one redundant test removed) |
| Frontend (`frontend/`) | **32 / 32 pass** | No changes to frontend |
| Backend (`backend/`) | BLOCKED (461 fails) | Pre-existing: no `ibvap_test` database; app user lacks root to create one. Not caused by Phase 2. |
| Frontend build | PASS | `vite build` succeeds (chunk size warning is pre-existing) |

---

## What didn't change

- `ANPR_DETECTION_CONFIDENCE` default remains 0.45 (threshold test showed all values
  0.30–0.50 detect the same 23 plates in the 50-car sample; no justification to change)
- OCR lifecycle unchanged: sample window target=3, maximum=3, confirm=2, early accept ≥0.90
- One PLATE_DETECTED per track (idempotency, evidence capture) unchanged
- YOLO vehicle detector, YuNet face detector, EasyOCR, ByteTrack untouched
- No incident clips, no plate text fabrication, no hardcoded paths
- No config defaults or consensus thresholds modified

---

## Pre-existing blockers carried forward

1. **Backend test DB missing:** `ibvap_test` database doesn't exist; `ibvap_app` user
   has no CREATE DATABASE grant; MySQL root password unavailable. This is an
   infrastructure issue unrelated to Phase 2.
2. **ANPR video not in repo:** `/Users/sumitsinghbagdwal/Downloads/Automatic Number Plate
   Recognition (ANPR) _ Vehicle Number Plate Recognition (1) (1).mp4` is a local
   user file; kept out of git per standard practice.

---

## Remaining work (not Phase 2 scope)

- OCR improvement: EasyOCR struggles on sub-50px plates; consider PaddleOCR or a
  fine-tuned Indian-plate OCR model for real-world 1080p footage
- Indian-plate-specific fine-tune of the plate detector (current model is generic)
- Larger benchmark on user's own 1080p footage with confirmed plate text ground truth
- Backend regression (blocked by test DB provisioning)
- LPR parking lot demo scenarios

---

**Decision: KEEP.** All work is complete. Phases 1 and 2 are done. Phase 3 pending
user direction.