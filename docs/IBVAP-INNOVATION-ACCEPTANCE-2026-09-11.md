# IBVAP innovation acceptance — 11 September 2026

## 1. INNOVATIONS IMPLEMENTED

Results distinguish implemented/tested logic from live operational acceptance. Synthetic images and disposable database fixtures below are explicitly test data, never operational observations. No CAM-01/CAM-02 stream was started or reconfigured. Their URLs are pending.

| Innovation | Status | Evidence and boundary |
| --- | --- | --- |
| Explainable Risk | PASS — automated logic | Actual normalized rule contributions and duration contributions are exposed; stored factors drive the UI. No new scoring model. Browser/live agreement remains unverified. |
| Progressive Escalation | PASS — automated logic | One incident across MEDIUM/HIGH/CRITICAL; same-tier decisions deduplicate. Higher same-tier scores refresh reasons without another severity notification or losing acknowledgement. |
| Multi-Camera Correlation | DEGRADED — live acceptance pending | Configured-neighbor/time/shared-risk or validated high-confidence registration association implemented. Camera/session isolation and access controls tested. No simultaneous live-camera test. |
| Camera Quality | PASS — image fixtures | Configurable sharpness, brightness and visibility diagnostics; normal, blurred, dark and overexposed fixtures tested. No threat-score increment from darkness. Real-camera calibration pending. |
| Fast ANPR | DEGRADED | Quality-gated first-read/short-window consensus and deduplication tested; dedicated plate model missing. No real OCR accuracy or persistence-latency claim. |
| Evidence Package | DEGRADED — live acceptance pending | Real persisted incident grouping, media references, factors and timeline implemented; isolated linkage/access and image-file tests pass. No active operational incident available for a live package test. |
| Adaptive Edge Processing | DEGRADED — performance unmeasured | Per-camera measured-cost cooldowns, stale optional-work skips, bounded confirmation retries and no secondary job queue. An individual OCR call is still synchronous/nonpreemptible. |
| Offline-First | DEGRADED / HQ NOT ACTIVE | Local API/database status is separate from camera status and HQ integration. No external receiving endpoint supplied; no outbound synchronization or persistent outbox claimed. |
| Border Map Integration | PASS — preservation/data checks | Full map feature retained, including Dashboard preview and Leaflet. Six data/realtime tests pass; browser interaction and live coordinates remain unverified. |

Operator prioritization, separate confidence dimensions, a Related Activity panel and persisted incident audit/lifecycle timestamps are integrated into existing pages. No face recognition, identity database, person re-identification or LLM alert decision was added. Node Alert Manager remains authoritative. Related Activity currently uses a read-only REST query; this is not a new dedicated push-notification stream or map route animation.

## 2. FILES CHANGED

Paths are relative to the repository root. This scoped inventory describes the stabilization/innovation work, not ownership of every pre-existing modification in the already-dirty worktree. Multiple paths in one row share the stated reason; unrelated edits and existing deletions were preserved.

| Files | Why |
| --- | --- |
| `.gitignore` | Ignore local captured frame/runtime logs without deleting them. |
| `README.md`, `ai_engine/README.md` | Startup, model-readiness and verification guidance. |
| `docs/IBVAP-STABILIZATION-2026-09-11.md`, `docs/IBVAP-INNOVATION-ACCEPTANCE-2026-09-11.md` | Record tested changes, acceptance evidence and outstanding limits. |
| `scripts/check-readiness.sh`, `ai_engine/check_readiness.py` | Read-only dependency/local-model checks; no downloads or camera probes. |
| `ai_engine/.env.example`, `ai_engine/config.py` | Quality, ANPR, face limits and adaptive-secondary settings. |
| `ai_engine/main.py` | Explicit all-camera mode, per-camera runtime, bounded metrics, evidence linkage and demand-driven secondary processing. |
| `ai_engine/api/camera_registry.py`, `ai_engine/api/routes.py`, `ai_engine/schemas/health.py` | Per-camera runtime registry, exact-camera preview and health contract. |
| `ai_engine/streaming/camera_manager.py` | Authenticated discovery and independent camera supervisors without duplicate workers. |
| `ai_engine/streaming/live_reader.py`, `ai_engine/streaming/live_ingest.py` | Safe handling of timed-out native reads and concurrent streams. |
| `ai_engine/streaming/frame_sampler.py` | Enforce live target sampling even when decoder FPS is unknown. |
| `ai_engine/integrations/node_client.py` | Camera discovery and actual event mappings/counts for evidence delivery. |
| `ai_engine/preprocessing/quality.py` | Lightweight configurable frame/crop quality diagnostics. |
| `ai_engine/detectors/yolo_detector.py`, `ai_engine/anpr/ocr.py` | Require local weights; avoid implicit model downloads. |
| `ai_engine/anpr/validator.py` | Reject incomplete formats and invalid confidence; support configured conventional/BH formats. |
| `ai_engine/anpr/models.py` | Carry crop, quality and acceptance metadata. |
| `ai_engine/anpr/state.py` | Fast first-read/weighted consensus, bounded history and current agreeing evidence geometry. |
| `ai_engine/anpr/manager.py` | Quality-before-OCR, accepted-track suppression, recent same-camera dedup and pending-confirmation signal. |
| `ai_engine/faces/models.py`, `ai_engine/faces/state.py`, `ai_engine/faces/manager.py` | Current crop geometry, quality metadata, short-miss retention and bounded improving evidence. |
| `ai_engine/trackers/track_manager.py` | Preserve tentative/briefly missing tracks while expiring lost state. |
| `ai_engine/evidence/manager.py`, `ai_engine/evidence/recorder.py` | Event-linked plate/vehicle/face crops and atomic non-overwriting publication. |
| `ai_engine/risk/state.py`, `ai_engine/risk/engine.py` | Expose the existing normalized calculation, not fabricated additive weights. |
| `ai_engine/workers/secondary_scheduler.py` | Per-camera/task measured-cost scheduling with bounded confirmation retries. |
| `ai_engine/tests/test_camera_manager.py`, `ai_engine/tests/test_health_endpoint.py`, `ai_engine/tests/test_preview_mjpeg.py` | Multi-camera discovery, registry and preview isolation regressions. |
| `ai_engine/tests/test_live_reader.py`, `ai_engine/tests/test_live_ingest.py`, `ai_engine/tests/test_frame_sampler.py` | Native-read safety, concurrency and unknown-FPS sampling checks. |
| `ai_engine/tests/test_anpr.py`, `ai_engine/tests/test_anpr_realtime_and_lag.py`, `ai_engine/tests/test_faces.py`, `ai_engine/tests/test_live_session_dedup.py` | Format/quality-aware fixtures, consensus, crop cap and session/dedup regressions. |
| `ai_engine/tests/test_quality_and_acceptance.py`, `ai_engine/tests/test_evidence_acceptance.py` | Explicit image quality/acceptance and immutable linked-media tests. |
| `ai_engine/tests/test_risk_engine.py`, `ai_engine/tests/test_secondary_scheduler.py` | Actual contribution example and bounded optional-work policy tests. |
| `backend/package.json`, `backend/package-lock.json` | Safe test preparation command and compatible patched `qs` dependency override. |
| `backend/src/db/seed.js`, `backend/src/db/prepare-test.js` | Explicit demo opt-in and isolated-test database guard/fixtures. |
| `database/seeds/demo_seed.sql`, `database/seeds/cleanup-demo-fixtures.sql` | Remove hardcoded operational-database selection from scripts. |
| `database/migrations/023_camera_geographic_config.sql`, `database/migrations/024_plate_vehicle_evidence.sql`, `database/schema.sql` | Add nullable geography and PLATE/VEHICLE evidence types without deleting data. |
| `backend/src/controllers/sourceConfig.controller.js`, `backend/src/services/sourceConfig.service.js`, `backend/src/routes/internal.routes.js` | Authenticated all-camera source configuration discovery. |
| `backend/src/repositories/camera.repository.js`, `backend/src/services/camera.service.js` | Persist/validate geography, explicit neighbors and source configuration safely. |
| `backend/src/services/cameraRuntime.service.js` | Whitelist per-camera quality and adaptive runtime fields. |
| `backend/src/realtime/realtime.service.js` | Preserve configured geographic fields in safe camera updates. |
| `backend/src/repositories/event.repository.js` | Camera/session/track-scoped deterministic initial event identities and accurate creation results. |
| `backend/src/services/aiObservation.service.js`, `backend/src/services/contextObservation.service.js`, `backend/src/services/faceObservation.service.js`, `backend/src/services/anprObservation.service.js`, `backend/src/services/riskObservation.service.js` | Retry-safe ingestion, actual counts/mappings and evidence-compatible existing event references. |
| `backend/src/repositories/alert.repository.js`, `backend/src/services/alertManager.service.js` | Transactional dedup/escalation, replay recovery, stored factors and stable priority ordering. |
| `backend/src/repositories/evidence.repository.js`, `backend/src/services/evidence.service.js` | Event/type/camera linkage, concurrent face cap and storage-path confinement. |
| `backend/src/services/eventCorrelation.service.js`, `backend/src/controllers/event.controller.js`, `backend/src/routes/event.routes.js` | Bounded, permission-filtered Related Activity endpoint with stable relationship IDs. |
| `backend/src/services/incidentPackage.service.js`, `backend/src/controllers/alert.controller.js`, `backend/src/routes/alert.routes.js` | Read-only camera/session/track-scoped incident package using existing persistence. |
| `backend/src/controllers/health.controller.js` | Separate local health from explicitly inactive HQ synchronization. |
| `backend/tests/alertManager.test.js`, `backend/tests/integration.hardening.test.js` | Escalation/concurrent retries, geographic access, evidence cap/path safety, correlation and incident grouping. |
| `backend/tests/internal.source-config.test.js`, `backend/tests/cameraRuntime.unit.test.js` | Source discovery and safe runtime serialization coverage. |
| `frontend/package.json` | Keep one working frontend test command. |
| `frontend/src/utils/mapData.mjs`, `frontend/src/components/map/useMapRealtime.js` | Shared real-coordinate normalization and realtime map updates. |
| `frontend/src/services/mapApi.js`, `frontend/src/components/map/useBorderMap.js`, `frontend/src/components/map/leafletUtils.js`, `frontend/src/components/map/map.css` | Preserve real map data, popup behavior and responsive map integration. |
| `frontend/src/pages/BorderMap.jsx`, `frontend/src/components/dashboard/BorderMapPreview.jsx` | Keep full map and dashboard preview connected to shared real data. |
| `frontend/src/components/admin/cameras/CameraForm.jsx`, `frontend/src/services/adminApi.js` | Edit actual coordinates/neighbor relationships and handle empty optional FPS. |
| `frontend/src/pages/CameraDetails.jsx` | Compact separate camera-quality and adaptive-processing diagnostics. |
| `frontend/src/utils/riskReasons.mjs`, `frontend/src/components/alerts/RiskReasons.jsx`, `frontend/src/components/events/EventRiskContext.jsx` | Render actual persisted factors/contributions, with honest legacy/missing-value handling. |
| `frontend/src/utils/incidentTimeline.mjs`, `frontend/src/components/alerts/IncidentTimeline.jsx`, `frontend/src/components/events/EventTimeline.jsx` | Use real persisted timestamps, without invented detection stages. |
| `frontend/src/pages/Alerts.jsx`, `frontend/src/components/alerts/AlertRow.jsx` | Severity-first ordering and compact top contributing factors. |
| `frontend/src/services/alertApi.js`, `frontend/src/services/eventApi.js` | Incident-package/related-event adapters and shared real evidence mapping. |
| `frontend/src/pages/AlertDetails.jsx`, `frontend/src/pages/EventDetails.jsx` | Existing-page incident/related-activity integration, guarded refreshes and partial-data states. |
| `frontend/src/components/events/RelatedEvents.jsx` | Explain event association and correlation confidence without identity claims. |
| `frontend/src/components/common/EvidenceGallery.jsx` | Authenticated real image/video viewer with loading/error states and safe blob lifecycle. |
| `frontend/src/components/alerts/AlertEvidence.jsx`, `frontend/src/components/events/EventEvidence.jsx`, `frontend/src/components/alerts/RelatedEvidence.jsx` | Replace fabricated evidence overlays/IDs/duration with actual media and metadata. |
| `frontend/src/__tests__/mapData.test.mjs`, `frontend/src/__tests__/riskReasons.test.mjs`, `frontend/src/__tests__/evidenceGallery.test.mjs` | Map data integrity, truthful factors/timeline and server-rendered evidence presentation. |

## 3. RISK EXPLANATION EXAMPLE

Actual passing unit test: `ai_engine/tests/test_risk_engine.py::test_emitted_explanation_matches_the_real_normalized_score`.

- Camera: `TEST-RISK` (isolated engine fixture, not CAM-01).
- Track: `77`, PERSON, detection confidence `0.95`.
- Risk: **60**; severity: **HIGH**.
- Factors: active `RESTRICTED_ZONE_ENTRY`, configured weight **3**, actual normalized contribution **60**.
- Calculation: enabled weights 3 + 2 = 5; only restricted-zone evidence is active, so 3 / 5 × 100 = 60. The configured virtual-fence rule is not shown as an active factor.
- Aggregation metadata: `NORMALIZED_RULES_PLUS_DURATION_CAPPED_100`.

This executes the actual RiskEngine and asserts its output; it does not claim a live person, a browser screenshot, or a measured production incident. Duration contributions remain current tier values, not per-frame accumulation.

## 4. ALERT ESCALATION TEST

Isolated API/database test: one camera/session, track `9991`, injected risk sequence 40/40 MEDIUM, 65/65 HIGH, 90/90 CRITICAL.

| Transition | Notification-producing decisions |
| --- | --- |
| MEDIUM | 1 CREATED |
| HIGH | 1 ESCALATED |
| CRITICAL | 1 ESCALATED |
| Duplicate same-tier | 0 new notification-producing decisions; 3 DEDUPLICATED results |

Exactly one alert ID and three evidence requests were asserted. Frontend notification-policy tests also pass. These are decision/policy counts, **not observed browser sound/toast counts**. Eight concurrent identical deliveries commit one event/alert; replay after resolution does not reopen it. Six concurrent observations of the same unresolved session/track share one incident. A same-tier score increase preserves ACKNOWLEDGED status.

## 5. MULTI-CAMERA TEST

CAM-01: live stream NOT TESTED — URL pending. CAM-02: live stream NOT TESTED — URL pending.

Independent manager/runtime and camera/session identity behavior pass automated tests. The same numeric track/session across two fixture cameras yields separate initial events. Failed discovery does not silently remove running workers; a stopping worker is not duplicated.

Related activity: PASS in isolated database fixtures. A configured neighboring camera's close-time HIGH event with shared `FENCE_CROSSING` reason is included; an unrelated camera is excluded. Operator assignment restrictions are enforced. Ordinary detections, old observations and numeric track equality alone do not establish cross-camera association.

Registration-based association is implemented only for high-confidence validated matching plates and configured neighbors in the bounded time window. No real vehicle traversed CAM-01/CAM-02 during verification. Cross-camera person identification: **NOT IMPLEMENTED**. Correlation confidence is not identity confidence.

## 6. CAMERA QUALITY TEST

CAM-01 sharpness/brightness/visibility: **NOT MEASURED**. CAM-02 sharpness/brightness/visibility: **NOT MEASURED**.

Actual deterministic image-fixture measurements from the implemented analyzer:

| Fixture | Laplacian variance | Brightness (0–255) | Visibility | Brightness status |
| --- | ---: | ---: | --- | --- |
| Textured image, fixed random seed 7 | 16727.37 | 124.25 | GOOD | NORMAL |
| Same image, Gaussian blur | 1.03 | 124.26 | DEGRADED | NORMAL |
| Black image | 0 | 0 | POOR | TOO_DARK |
| White image | 0 | 255 | POOR | OVEREXPOSED |

Normal/blur/dark/overexposed classification assertions pass. Diagnostics contain no threat risk score. Thresholds are configurable and require camera-specific calibration; these numbers are not field accuracy measurements.

## 7. ANPR

Vehicle: synthetic plate candidate on fixture track `7`; **no real vehicle tested**.

Raw candidate text: `UK04AB1234`. Normalized candidate: `UK04AB1234`. Confidence: `0.95` (injected fixture value, not a measured OCR confidence). Crop quality: `0.7`. Validation: `VALID_FORMAT`. Actual state-machine result: `FIRST_READ`, one confirmation read, accepted on the first update.

The uncertain-read fixture selects two agreeing `UK04AB1234` candidates over one higher-confidence outlier within one second of simulated time. Reads 180 seconds apart cannot confirm each other. Fragments such as `2363` and `DV2363` are rejected; character substitutions are not guessed.

Time to persistence: **NOT MEASURED**; state-machine acceptance time is not database latency. Duplicate events: automated accepted-track/retry suppression passes; live duplicate count is **NOT MEASURED**. Local YOLO11n, YuNet and EasyOCR weights loaded successfully on CPU. Dedicated plate detector weights are absent: **HEURISTIC / DEGRADED**, not production ANPR acceptance.

## 8. EVIDENCE PACKAGE

Incident: generated isolated-test alert UUID, HIGH/70, fixture camera/session/track `55`; not a production incident. The package is available through authenticated `/api/alerts/:alertCode/package` and the existing Alert Details layout.

| Item | Result and scope |
| --- | --- |
| Snapshot | PASS — stored snapshot metadata linked to the fixture alert; live snapshot viewing not verified. |
| Clip | NOT AVAILABLE in this fixture; actual CLIP records use video playback, never a fabricated duration or sample clip. |
| ANPR | NOT AVAILABLE in this incident fixture; separate image-file tests verify linked plate/vehicle crops and stable IDs/checksums. |
| Face evidence | PASS — same-session face evidence metadata included; another session/camera excluded. No identity claim. |
| Risk explanation | PASS — persisted reasons/score reused; actual numeric contribution calculation independently tested in section 3. |
| Timeline | PASS — anchor/face event timestamps and stored lifecycle data only. No invented detection stages. |

Evidence file publication tests use actual temporary JPEG files and prove stable-ID retries do not overwrite original evidence. The package access test denies an unassigned operator and excludes filesystem paths/stream credentials. Server-rendered gallery tests verify honest missing/loading states, not interactive media playback. No active operational alert was available for a live package smoke test. No new PDF/export subsystem was added, as permitted by the brief.

## 9. EDGE PERFORMANCE

| Metric | Result |
| --- | --- |
| Camera FPS | NOT MEASURED — RTSP URLs pending |
| AI FPS | NOT MEASURED under live load |
| YOLO latency | NOT MEASURED under live load |
| OCR latency | NOT MEASURED under live load |
| Face latency | NOT MEASURED under live load |
| Frame backlog | Latest-frame ingest and no secondary job queue are implemented/tested; sustained live frame age/backlog unmeasured |
| CPU | Models loaded on CPU; sustained utilization unmeasured |
| RAM | Sustained multi-camera memory unmeasured |
| GPU | NOT BENCHMARKED |

Adaptive scheduling tests inject known processing costs and verify per-task/per-camera cooldowns, stale optional-work skips and at most two prompt ANPR confirmation retries. These injected milliseconds are not benchmarks. Core preview is published before secondary OCR/face work; risk thresholds are not changed by load. RTSP ingestion has its own producer, but one slow synchronous secondary call can still delay the next inference iteration. Hard realtime behavior is not established.

## 10. TEST SUITES

| Suite/check | Result |
| --- | --- |
| AI | **394 passed / 0 failed** |
| Backend | **247 passed / 0 failed**, disposable MySQL on port 33307 |
| Frontend | **32 passed / 0 failed** |
| Frontend production build | **PASS** |
| Backend ESLint | **PASS**, zero warnings allowed |
| `git diff --check` | **PASS** |
| Fresh database migrations | **001–024 PASS** on isolated instance |
| Operational additive migration | Only pending **023/024** applied; no seeds or cleanup |
| Page API/service-adapter checks | Required requests succeeded; user confirmed Alerts, Events, Live Surveillance and Analytics now load |

Backend production dependency audit: zero reported vulnerabilities after compatible updates/`qs` override. Frontend production audit: two moderate affected router packages remain; available remediation requires a major migration. Neither result is a penetration test. Existing build warnings: large bundle, Vite CJS/module format. Python reports one Starlette/httpx deprecation warning. Browser, Docker deployment, actual offline disconnect and end-to-end RTSP acceptance were not performed.

The temporary test MySQL server on port 33307 was shut down after verification. Its temporary data directory was retained; the operational server on port 3306 was not stopped.

## 11. LIMITATIONS

- CAM-01/CAM-02 URLs, actual coordinates and neighbor relationships must be supplied/reviewed before live acceptance. No previous RTSP URL was reused or probed. Existing source values/enabled flags were not changed.
- Low light, angle, motion blur, small plates/faces and tracking loss remain real limitations. Quality gates can reject unusable evidence; they do not restore missing detail. No formal precision/recall/OCR accuracy was measured.
- Dedicated plate detector weights are missing. HEURISTIC localization is development/degraded mode. GPU throughput and shared GPU/model scheduling are unverified/not implemented.
- A native decoder read that never returns is quarantined rather than unsafely released. Process-level forced recovery for that condition is not implemented.
- Full Border Map code is preserved, not replaced. Browser zoom/pan/fullscreen, controls, filters, layers, legend, popups, realtime behavior and responsive layout still need interactive acceptance. Image-space zones are not invented as geographic polygons. External basemap tiles may fail without internet; offline tiles are not provisioned.
- HQ synchronization is NOT ACTIVE: no endpoint, no fabricated transmissions, no restart-safe outbound outbox. Network failure/recovery and sustained local-only operation need explicit testing. Redis was degraded in the running local health check.
- One synchronous secondary model call can delay inference. Live frame age, queue behavior, memory stability, OCR/face load and clip post-roll completeness remain unmeasured.
- No active operational incident was available to verify new package media playback in a browser. Missing legacy session/history cannot be reconstructed honestly; packages show only available scoped records and indicate bounded-query truncation.
- Frontend router advisories, dev/Python dependency audits, deployment hardening and Docker verification remain outstanding. Existing compose PostgreSQL scaffolding does not establish a working MySQL deployment.
- The repository already contained extensive unrelated edits/deletions. They were not cleaned up wholesale. No map code or operational evidence was deleted.

See [stabilization and safe startup instructions](IBVAP-STABILIZATION-2026-09-11.md). This phase is implementation plus automated verification, **not production/live-camera sign-off**. No further major features were added after the scoped innovation layer.

## 12. FINAL SIH INNOVATION SUMMARY

IBVAP combines video detection and tracking with configured spatial and temporal context to explain risk, rather than treating every detected person as a threat.  
Its deterministic alert manager consolidates an incident and escalates meaningful severity changes without repeated same-tier alerts.  
Related Activity links justified neighboring-camera events without claiming person identity, while incident views use persisted evidence and timelines.  
Camera-quality diagnostics and demand-driven secondary processing make uncertainty and workload visible to operators.  
The Border Map remains active; live two-camera performance and production ANPR acceptance await RTSP sources and dedicated plate weights.
