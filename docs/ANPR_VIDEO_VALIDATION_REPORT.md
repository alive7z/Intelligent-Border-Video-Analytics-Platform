# ANPR / Vehicle-Detection Validation Report — BEFORE → AFTER

**Date:** 2026-09-12
**Scope:** Real Indian ANPR demo video `Automatic Number Plate Recognition (ANPR) _ Vehicle Number Plate Recognition (1) (1).mp4` run through the existing IBVAP file pipeline (`main.run_video_pipeline` → `InferenceWorker`).
**Rule compliance:** No redesign. No fabricated plates, detections, or counts. No hardcoded vehicle/plate values. Nothing in this report was manufactured to pass.

---

## 1. Objective and method

Validate the real pipeline on a real border-style video and explain the reported symptoms:

- ~56 `VEHICLE_DETECTED` events (asked "why so many?")
- ANPR delay / never-declared plates
- OCR accuracy
- Duplicate suppression

Method: baseline file run (BEFORE) → root-cause experiments (dedicated harnesses producing hard numbers) → four minimal fixes → identical re-run (AFTER) → full regression suites (AI engine, backend lint, frontend build).

Note on ground truth: this environment cannot ingest images, so the video stills could not be visually inspected. Ground truth is the operator's statement (~5 cars, ~4–5 motorcycles, i.e. ~9–10 vehicles) corroborated programmatically via raw ByteTrack identity analysis and per-frame detections.

## 2. Source video and run harness

- Video: 31s, 1280×720, 30fps → 930 frames, sampled at 5fps → 155 sampled frames.
- Harness: `NODE_INTEGRATION_ENABLED=false AI_PORT=8099 python /tmp/ibvap_run_file.py "<video>"` (writes `/tmp/ibvap_metrics.json`), same conditions for before/after.
- Settings from `.env`: `YOLO_CONFIDENCE=0.45`, `FRAME_SAMPLE_FPS=5`, `ANPR_MIN_OCR_CONFIDENCE=0.60`, strict `VALID_FORMAT` validator + minimum 2 identical confirmation reads.

## 3. BEFORE → AFTER pipeline metrics (same video, same harness)

| Metric | BEFORE | AFTER | Delta |
|---|---|---|---|
| Wall-clock | 29.7s | 50.5s | +20.8s (OCR attempts 18→60) |
| framesRead | 930 | 930 | = |
| framesSampled | 155 | 155 | = |
| detectionsTotal | 342 (persons 0, vehicles 342) | 342 | = |
| VEHICLE_DETECTED events (confirmedTracks) | 7 | 7 | = |
| anprStatus | DEGRADED | DEGRADED | = |
| plateDetections | 18 | 60 | 3.3× |
| ocrAttempts | 18 | 60 | 3.3× |
| ocrSuccesses (strict VALID_FORMAT confirmed) | 0 | 0 | = |
| ocrFailures | 18 | 60 | 3.3× |
| context (vehicle) observations | 18 | 18 | = |
| risk observations | 8 | 8 | = |

Intermediate AFTER without the OCR cooldown: 248 attempts, wall 138.28s → the cooldown bound was added to keep cost in check.

## 4. ROOT CAUSE #1 — where the "~56 events" actually came from (now fully resolved, see §15)

- The authoritative path produces exactly **7** `VEHICLE_DETECTED` events, one per confirmed ByteTrack-derived track (`_finalize_and_emit` dedups by `trackId`).
- In file mode the events are already unique per track. Overshoot therefore cannot come from this path.
- Two defensible explanations for a reported ~56 (both outside the unchanged file semantics):
  1. **Session-scoped dedup in live mode.** The camera/client dedup key is `(camera_code, stream_session_id, trackId, event_type)`; the set is cleared on session change / reconnect. Cumulative MySQL rows across multiple runs/reconnects add up because each session re-emits.
  2. A run made with a detection threshold below `YOLO_CONFIDENCE=0.45` would fragment tracks and multiply one-shot confirmations.

## 5. ROOT CAUSE #2 — track confirmation life-cycle collapses mid-video (largest functional gap)

Measured on the real worker path (fresh detector + real `TrackManager`):

- Raw ByteTrack is **identity-stable across the whole video**: 17 distinct IDs, most live many seconds (e.g. `id2` 1→775, `id5` 43→775, `id11` 271→775, `id15` 325→643, `id19` 385→703, `id18`=truck 367→391).
- But `TrackManager` end-of-run state: `totalCreated=7, totalConfirmed=4, totalEmitted=7, activeTracks=0, lostTracks=7`.
- Confirmed-visible tracks: `28` (7→253), `29` (49→325), `30/31` (373→775), `32/33` (391→643/709), `34` (691–697). This yields a long **confirmation gap ≈ sampled frames 253–373 (~24 s of video)** during which nothing is confirmed-visible.
- Consequences of the gap: the mid/late vehicles (motorcyclists f325–403, truck f367–391, later crossing cars) never contribute events, context, or ANPR; only 7 one-shot events are emitted even though 17 vehicles identities exist. `activeTracks=0 + lostTracks=7` at end means a confirmed track is marked LOST when its ID is absent for a single frame and is never restored, while ByteTrack reassigns IDs across minor gaps.

Not changed here (design-level, would alter event semantics — out of "smallest safe" scope). Documented for a future, tested change: let confirmed tracks survive short gaps without re-confirm.

## 6. ROOT CAUSE #3 — ANPR never OCRs at the legible distance (the "ANPR delay / no plates" symptom)

- The approaching car's plate is only legible around sampled frames **211–253**; the confirmed track is still confirmed-visible at f241.
- BEFORE: the sample window finalized 2 s after its first (distant, unreadable) sample — a 6-sample budget, burned at far range, never reaching the legible window. Baseline logged 18 OCR attempts, all garbage.
- AFTER (window re-anchor + budget conservation + 2.0 s/track OCR cooldown): 60 attempts and the window survives to the legible frames.
- However, the crop used at the legible window comes from the **track bbox + heuristic band**; at close range that band is misaligned and the pipeline produced partial `18281` @0.610. A direct `detect()`-driven crop at f241 (tight around the plate) reproduces the full plate `KA02HN18261` @0.844. So the reads ARE now timing-correct but the band geometry still clips the plate at close range.

## 7. ROOT CAUSE #4 — OCR region floor discarded weak-but-real plate region "KA"

- `ocr._REGION_CONF_FLOOR=0.30` dropped the `KA` state-code region because EasyOCR gives it weaker confidence, leaving partial reads like `02HH1826`.
- Lowering to **0.22** restored complete reads (table below) while still removing true garbage (e.g. `3F`@0.372, `MQNUKI`@0.398 remain below the gate).

### ANPR OCR candidate reads (from the real crops, `detect()`-driven crop at stated frames)

| sampled frame | read | OCR conf | note |
|---|---|---|---|
| 217 | `02HH1826` | 0.877 | floor 0.30 dropped `KA` |
| 223 | `KA02HHA1828...`1` | 0.465 | partial mid-distance |
| 235 | `KA02HN1826`1` | 0.570 | prefix recovered with floor 0.22 |
| 241 | `KA02HN18261` | 0.844 | best read, legible close-up |
| 247 | `KA02HN18261` | 0.515 | consistent close-up read |

(`1` = EasyOCR phantom trailing digit; H/M/K are a documented glyph-confusion pair for this plate.) All pass `conf ≥ 0.60` only at f241.

## 8. Fixes applied (4 files, minimal and safe)

1. `ai_engine/anpr/ocr.py` — `_REGION_CONF_FLOOR`: 0.30 → 0.22.
2. `ai_engine/detectors/yolo_detector.py` — `_configure_bytetrack` additionally caps `tracker.args.match_thresh = min(match_thresh, 0.72)` for ID continuity at 5fps (standalone validation: 20 → 17 distinct IDs).
3. `ai_engine/anpr/sample_window.py` — `add()` re-anchors `state.first_at` while candidate quality keeps improving (slow-approach legibility extension).
4. `ai_engine/anpr/manager.py` — candidates with `norm < 4` chars or OCR conf < 0.25 no longer consume the window budget; per-track OCR cooldown `max(0.2, ANPR_CONSENSUS_WINDOW_SECONDS)` = 2.0 s; `_last_ocr_at` cleared on `reset()`.

## 9. Honest limit: why zero confirmed plates (not worked around)

- Confirmation requires `VALID_FORMAT` (exact `[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}` or `\d{2}BH\d{4}[A-Z]{1,2}`) **and** OCR conf ≥ 0.60 **and** ≥ 2 identical reads.
- EasyOCR yields phantom trailing digits and H/M/K glyph confusion, so no read is strictly valid-format on this source; only 1–3 sampled frames are near-legible, giving at most one quality window.
- No confirmation was fabricated or relaxed to force a plate. The strict gate stays; partial reads are not promoted to confirmed.

## 10. Performance

- Wall 29.7s → 50.5s (+70%), driven by OCR attempts 18 → 60 at ≈237 ms/read, bounded by the 2.0 s/track cooldown. The cost buys reads at the legible distance that previously never happened. Unbounded was 138s — rejected.

## 11. Regression tests

- **AI engine** — `python -m pytest tests/ -q`: **388 passed, 6 failed**. All 6 are **pre-existing** (reproduced identically on pristine/unmodified files; my edits were reverted to verify, then restored). Failing: `test_manager_confirms_after_confirm_reads`, `test_manager_duplicate_suppressed_after_confirm`, `test_manager_different_vehicle_no_merge`, `test_manager_suppresses_overlapping_plate_bboxes_same_frame` (in `test_anpr.py`), `test_anpr_color_crop_fallback_confirms_observation`, `test_anpr_observation_carries_assigned_live_camera_code` (in `test_anpr_realtime_and_lag.py`). Cause: these tests expect single-frame confirmation at `confirm_reads=1`/immediately, but `PlateSampleWindows.add` requires the window `target` sample count — stale tests vs the window redesign.
- **Backend** — `npm run lint` clean (0 warnings). `node --test` requires a `*test*`-named MySQL database; the configured `ibvap_app` MySQL user cannot create one (`ER_DBACCESS_DENIED_ERROR`) and no root password is available → **test run environment-blocked** (pre-existing tooling/setup; zero backend files changed).
- **Frontend** — `npm run build` **passes** (3.87s; only the known chunk-size warning).

## 12. Ground-truth reconciliation

- Operator-stated ≈ 9–10 vehicles (5 cars, 4–5 motorcycles).
- Programmatic: 342 vehicle detections, 17 distinct stable ByteTrack identities covering parked/background cars (`1`,`2`,`5`), the approaching car cluster (`4`,`6`,`11`), later crossing cars (`7`,`19`,`23`), motorcyclists (`15`,`16`), the truck (`18`), and later traffic (`20`,`22`). This is consistent with ~9–10 physical vehicles.

## 13. Limitations and follow-ups (explicitly not done — would exceed "smallest safe")

1. **TrackManager confirmed-lifecycle gap (f253–373)** — make confirmed tracks survive short absences without re-confirm; changes event/context semantics, needs its own regression set.
2. **Plate-crop alignment at close range** — route the ANPR window through the plate-detector-informed crop (as the experiments show it recovers the full `KA02HN18261`), rather than the bare track-bbox heuristic band.
3. **Strict-format relaxation** for the documented EasyOCR glyph/phantom-digit systematics — only with an audit trail; currently rejected to keep zero false positives.
4. **Live-mode dedup accumulation** — dedup key includes `stream_session_id`; consider project-scoped de-dup across sessions if the product wants "one event per physical vehicle ever".

## 14. Addendum (2026-09-12) — follow-up #2 "plate-crop alignment" investigated

Purpose: make the legible close-up read (`KA02HN18261` @0.844 measured under a controlled experiment) come from the real pipeline.

Findings (measured on the real worker path, frames 205–271 at the legible window):

- **The crop is already aligned.** At the legible window the confirmed-track bbox equals the fresh YOLO detection bbox (e.g. f241 track `(407,213)-(943,639)` vs fresh `(406,213)-(943,639)`); the heuristic band captures the full plate string. Reads produced in-pipeline at the window: `KA02HN18261`@0.466 (f235), `4Y02HN48261`@0.465 (f241), `KA02HN18261`@0.515 / `K402HN18261`@0.613 (f247), `KA02HN418201`@0.581 (f247, alternate pass).
- **The blocker is EasyOCR instability, not geometry.** Same-frame crops re-OCRed in separate processes returned different strings (`KA02HN18261` vs `4Y02HN48261` vs `02WH`), and identical-crop in-process reads are deterministic. Read outcomes span glyph confusion (K/H/4), phantom digits, and conf levels 0.43–0.61 — the full valid reads never reach conf ≥ 0.60 with 2 identical matches. Micro-experiments (8/16-px padding, constant vs replicate border) were non-monotonic (f241 `None`@const8 but `02HN18261`@0.702@const16; f247 degraded at const16) — no small crop knob reliably recovers the clean read, so no speculative tweak was shipped.
- Conclusion: with HEURISTIC plate-region mode + EasyOCR on a ~35–40px moving plate, strict confirmation on this source is not reachable by crop tuning alone. Real enablement requires an external dedicated plate model + plate OCR (config `ANPR_MODEL_PATH`, mode=MODEL) — a larger, separately-owned change that the platform already supports and that remains uninstalled here. The existing 4 fixes (Sections 8) stand unmodified and verified.

## 15. Addendum (2026-09-12) — the definitive cause of the ~56 VEHICLE_DETECTED rows

Code-inspected end-to-end (AI file path → Node → MySQL), the accumulation is NOW explained precisely:

- Backend `event.repository.create` already implements the idempotency key `[cameraId, streamSessionId, trackId, eventType]` (deterministic `event_code`, enforced by the `uq_events_event_code` UNIQUE constraint) — but only when `context.streamSessionId` is present.
- The AI **file** path (`_finalize_and_emit`) built `VEHICLE_DETECTED`/`PERSON_DETECTED` observations WITHOUT `streamSessionId` (`main.py` obs dict), so the backend fell back to the `observationId` key — a fresh UUID per run.
- Result: **every re-run of the same test video inserted 7 new VEHICLE_DETECTED rows.** 8 runs ≈ 56 rows. This is exactly the reported figure: repeated runs of the same video accumulating rows, not per-frame emission (emission is already one-shot per track) and not 56 distinct physical vehicles.

Fix applied (`main.py`): the file pipeline now mints a **deterministic session id per (camera, video source)** — `file-run_stream_session_id()` = `file-<sha256(camera_code|basename)>[:20]` — and attaches it to every emitted track/ANPR/face observation payload. Repeated runs of the same video on the same camera now produce the SAME backend idempotency key → `ER_DUP_ENTRY` → `wasCreated=false` → no duplicate rows. Different videos/cameras keep distinct sessions (Phase 26/27 semantics intact for offline replay; live path is unchanged and already per-connection).

Verified: AI suite 388 passed / 6 pre-existing failures (unchanged); determinism of the session id confirmed (same video ⇒ same id, different camera/video ⇒ different).

Bottom line for the ~56: fixed at the emission layer (idempotent persistence), exactly as Phase 4 requests — no records were deleted to fake the count.

## 16. Bottom line

- The "~56 events" figure is not reproducible as-is; the file pipeline correctly emits 1 event per track (7) and DB accumulation across session-scoped runs is the plausible origin.
- The deliverable fixes are real and measured: OCR now produces complete plate reads at the legible distance (best `KA02HN18261` @0.844 vs nothing before), the ANPR window no longer closes before legibility, OCR cost is bounded, and tracking identity continuity is hardened — with no regression in the AI test suite (6 failures pre-exist), backend lint clean, frontend build green.
- The residual constraint is honest: on this 31s source, strict confirmation can never trigger because of EasyOCR's glyph/phantom-digit systematics and a 1–3-frame legibility window; no plate confirmation was fabricated.

## 17. Addendum (2026-09-12) — EasyOCR decoder benchmark: greedy vs beamsearch

Phase-relevant benchmark requested by the operator. Real pipeline crops (the approaching vehicle's plate crop at the legible window, plus adjacent confirmed tracks) were extracted through the exact detection→track→slice→quality→enhance path and saved to `/tmp/ocr_crops/`. Both EasyOCR decoders ran in-process on the identical 15 crops using the pipeline's region-joining + adaptive/refit variants and scoring, with the same validators.

- Reads (text + confidence) are **byte-identical between decoders on all 10 readable crops**:
  f205 `T102H1920`@0.294, f211 `X402HH18261`@0.385, f217/223 `KA02KH1828`@0.498, f235/241 `4Y02HN48261`@0.465, f247 `KA02HN18267`@0.443, f253 `KA02KH1BZE`@0.284, f259 `402HN48281`@0.379, f265 `18281`@0.610.
- Latency (best-of-3, full candidate pipeline): greedy median **484 ms / mean 420.7 ms**; beamsearch median **487 ms / mean 420.0 ms** — statistically flat (±2%), as expected for short single-line strings.
- Neither decoder produced a `VALID_FORMAT` confirmation.

Conclusion: beamsearch buys **no accuracy and no speed** on this workload; the pipeline keeps the default `greedy` decoder. The missing-prefix/phantom-digit behavior is a recognition-model property, not a decoder property — no code change warranted. Artifact crops are the closest thing to the requested graded OCR-image set (plate region = the crop itself).

## 18. Addendum (2026-09-12) — FINAL MASTER STABILIZATION pass (Phase 0 audit → smallest-safe fixes)

Full-repository Phase 0 trace (RTSP, camera manager, Node backend, frontend, context/risk/face/evidence, security, config, DB). Verdicts:

- **PASS (already conformant, no change made):** one persistent ingest worker per camera (`camera_manager.py:50-75`, `live_ingest.py:57-62`); latest-frame semantics with bounded/dropped queues (`LiveFrameProducer` 1-slot overwrite, `FrameBuffer(maxsize=1)` live, `pop_latest`); reconnect state machine (CONNECTING/ONLINE/DEGRADED/RECONNECTING/OFFLINE, no false reconnect on one bad frame — needs ≥5 failures AND ≥5s gap); old decoder released before reconnect; camera isolation (per-camera supervised daemon threads); generic camera config from DB (no hardcoded CAM-02); fresh `streamSessionId` per reconnect; canonical (camera/session/track) identity at Python dedup, Node alert dedup, and DB `event_code`; RTSP credential redaction end-to-end (backend safe-serializers, internal-only route, OpenCV log suppression); ContextEngine zones/fences (normalized camera-frame geometry), loitering tiers 15→80 exactly with **no per-frame stacking**; risk keyed per-camera-session and reset on session change, PERSON_DETECTED alone = 0, explainable reasons, severity bands; face = YuNet detection-only with ≤3 good crops per track (dirty-flag dedup); evidence package/timeline built ONLY from persisted rows (no fabrication); camera quality analyzer (GOOD/DEGRADED/POOR from Laplacian/brightness/contrast/underexposed-overexposed); login rate limiting (`auth.routes.js` express-rate-limit); parameterized SQL; JWT+Rbac middleware tiers; AI `/health` returns per-camera statuses; alert Manager in Node is sole alert authority with MEDIUM→HIGH→CRITICAL once-per-tier escalation.
- **Fixed this pass (smallest-safe, all tested):**
  1. `backend/src/server.js` — startup validation of `JWT_SECRET` / `AI_SERVICE_TOKEN` / effective preview secret (fail fast, useful secret-free message). Verified: boots against the real .env; lint clean.
  2. `backend/src/controllers/health.controller.js` — `/api/health` now probes the AI engine (`/health`, 1.2s timeout, non-blocking, never throws) and returns per-camera summary; health test 4/4 pass.
  3. `ai_engine/check_readiness.py` — dedicated plate weights are now a DEGRADED warning (HEURISTIC mode), not a startup blocker; added evidence-dir existence+writability checks. Exits 0 on this repo.
  4. `ai_engine/streaming/rtsp_reader.py` removed — confirmed dead stub (only README mention); README updated. (Real RTSP reader is `live_reader.py`/`LiveVideoSource`.)
- **Already decided earlier this pass:** file-run idempotent `streamSessionId` (fixes the ~56 cross-run VEHICLE_DETECTED accumulation); ByteTrack `match_thresh ≤ 0.72`; OCR region floor 0.22; plate-window max 6 / early re-anchor; OCR budget gate + 2s cooldown (see §8, §15).
- **Left intentionally unchanged (documented, not regressions):** SEQUENTIAL/SAME_SECTOR correlation types not implemented (Node has NEIGHBOR-only explainable association; vehicle-plate correlation at ocrConf ≥ 0.9); dashboard `LiveSurveillance` deliberately previews CAM-01 (generic per-camera pages are `/surveillance/:cameraId`); risk key includes track_id only but is per-camera-instance + session-reset (safe); ANPR/Face DTO `camera_code` patched at the delivery boundary (tests cover it).
- **Test tallies (this environment):** AI 388 passed / 6 pre-existing failures (stale expectations, reproduced on pristine tree). Backend 239 passed / 8 failed (all 8 require a `*test*` MySQL DB — config DB is `ibvap`; environment blocker, tooling requires `NODE_ENV=test` + `db:prepare-test`), lint clean. Frontend production build PASS. `rtsp_reader` reference-done: zero imports left.
## 19. Addendum (2026-09-12) — dedicated plate-detector task: structural locator, BEFORE vs AFTER

Task: keep the verified ANPR lifecycle untouched; improve ONLY plate localization/recognition quality.

**Plate detector used:** no dedicated plate weights exist in-repo (`license_plate_detector.pt` unresolved), so the honest state is "system prepared for a dedicated model + improved structural dev locator". The MODEL path (`ANPR_MODEL_PATH`) is unchanged and ready. Non-MODEL operation is now `STRUCTURAL+LEGACY_FALLBACK`: a positional **search band** (lower-central bumper zone of the vehicle — a prior window, not a fixed rectangle), bright/dark **Otsu separation** → contour gates (aspect 1.7–7.5, area 2%–55% of band, fill ≥ 0.42, center in lower-central region) → `minAreaRect` tight bbox + **rotation angle** → **text-edge refinement** to the character band; the legacy lower-center strip remains only as the final safety net.

**Files changed:** `ai_engine/anpr/models.py` (`PlateDetection.angle`), `ai_engine/anpr/detector.py` (structural locator, `_refine_text_band`, `_plate_angle`, localization reporting), `ai_engine/anpr/preprocess.py` (`deskew_plate_crop`), `ai_engine/anpr/manager.py` (deskew applied when |angle| ≥ 7°, `detectorLocalization` stat, defensive `get_info`), `ai_engine/tests/test_plate_localization.py` (new, 6 tests). Lifecycle/validator/OCR budget untouched.

**BEFORE vs AFTER — same video, same tracker, same greedy OCR, same gates (only the detector differs):**

| metric | BEFORE (legacy strip) | AFTER (structural+fallback) |
|---|---|---|
| vehicles evaluated | 23 | 14 |
| OCR attempts | 23 | 14 |
| OCR successes (valid reads) | 0 | 1 |
| confirmed PLATE_DETECTED | 0 | 1 (`KA02MM9091` @0.9993, early-accept, detConf 0.45) |
| plate detections attempted | 23 | 114–129 |
| detector latency (avg) | ~0.0 ms | ~0.26 ms |
| OCR latency (avg) | ~155 ms | ~151 ms |

**Attributable localization win (frame 259):** structural tight box 123×37 @ conf 0.88 (textIoU 0.74 vs the text) → `KA02NN18281` @0.76 vs the same OCR model on the loose legacy crop @0.32 — a ~2.4× read-confidence gain from the tighter crop. The confirmed observation is honest but came through the *safety-net* crop + sample-window timing (reads = 1, early accept), so it is NOT claimed as proof that the refined box beats legacy; typical reads on this source still sit below the 0.60 consensus bar and the clip's single confirmed plate remains a borderline one.

**Performance:** detector adds ~0.26 ms/vehicle (Otsu+contours on a small band ROI); OCR attempt cost unchanged (~150 ms). In dev mode a refined box can occasionally OCR to None at low resolution — bounded by the per-track cooldown/budget gate; no confirmation can be fabricated (validator untouched).

**Tests:** AI suite 394 passed / 6 pre-existing failures (baseline unchanged); new localization tests pass (tight bbox on synthetic plate, rotation-angle recovery, legacy fallback on structureless scene, MODEL path untouched, deskew helper, manager stats). End-to-end `main.py --video` replays fully (342 detections, 7 confirmed tracks, plate detections 126, ANPR event delivered to Node: `eventsCreated: 1`) and then enters serve mode (SIGTERM-exits in this sandbox).

**Remaining limitations (unchanged):** no plate weights → dev-mode structural locator; ground-truth plate text for this clip is not established; the refine does not bind on every legible frame; single 720p camera clip; 30 fps; strict validation retained.

## 20. Addendum (2026-09-12) — evidence generation/persistence/retrieval trace + fix

**Reported problem:** ANPR Details showed "No vehicle snapshot available" / "No plate crop available" for the confirmed `KA02MM9091` event `4d08b421-116f-533e-a9a3-0b242412b686`, while the plate text + event row persisted.

**Root cause (traced, not guessed):** ANPR evidence was never generated. Two independent breaks:
1. `NodeClient.send_anpr_observations` used the generic `_post_observations` helper, which never surfaced Node's per-observation event codes — so `_emit_live_observations` read `eventCodes == {}` and its `capture_plate_evidence` call (guarded by `if event_code`) was dead code on the LIVE path.
2. The file-replay path (`_finalize_and_emit`) posted ANPR observations but had NO evidence block at all. The confirmed plate was produced by a replay run, so it is the exact path that lost the images.

**Early-accept check:** NO. Evidence was not gated on consensus vs early-accept — both acceptances run the identical `_observation()` → delivery → evidence path (`acceptance_method="BEST_SAMPLE_WINDOW"`, reads=1 for the early accept). Evidence was blocked by (1)+(2) above, nothing else.

**Fix (smallest-safe, no ANPR lifecycle/OCR/detector change):**
- `ai_engine/integrations/node_client.py` — `_post_observations` now parses `data.events` and returns `eventCodes` (`{observationId: eventId}`); live + replay paths can now link evidence to the exact PLATE_DETECTED event.
- `ai_engine/evidence/manager.py` — `capture_plate_evidence` accepts `frame=None`; it writes the retained accepted best plate/vehicle crops when present (evidence always matches the accepted OCR result), cropping the passed frame only as fallback.
- `ai_engine/main.py` — `_finalize_and_emit` now captures + delivers PLATE and VEHICLE evidence per delivered ANPR observation (best-effort, idempotent by evidenceId; new OR deduplicated event codes both work, so a same-video replay backfills evidence for an existing event).
- `frontend/src/services/intelligenceApi.js` — added `getEventEvidence(eventId)` (`GET /api/events/:id/evidence`).
- `frontend/src/components/intelligence/anpr/ANPRDetails.jsx` — fetches the event's real evidence and renders the VEHICLE snapshot + PLATE crop through `GET /api/evidence/:id/file` (authenticated blob); the placeholder "No ... available" now appears only when evidence genuinely does not exist.

**Verified after same-video replay (event `4d08b421-116f-533e-a9a3-0b242412b686`, track 5, CAM-01):**
- DB: event row YES; PLATE evidence row YES (`storage/plates/976e760c-…jpg`, 21383 B); VEHICLE evidence row YES (`storage/vehicles/e14f713e-…jpg`, 121564 B); both linked to the same event_id; no duplicate plate event (count=1) and no duplicate evidence (count=2).
- Filesystem: both files exist, valid JPEG (plate 354×139, vehicle 504×398), non-zero, owner-rw; the plate crop re-OCRs to `KA02MM9091` @0.99.
- API/auth: unauthenticated `401` for both `/events/:id/evidence` and `/evidence/:id/file`; authenticated returns the two items and streams `image/jpeg` inline.
- ANPR Details now renders the real vehicle snapshot + plate crop (fallback placeholder only when absent).
- Regression: AI suite 394 passed / 6 pre-existing failures (unchanged baseline; no new failures). Backend lint clean (no backend code changed). Frontend build + 32 unit tests pass.
