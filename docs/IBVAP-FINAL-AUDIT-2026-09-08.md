# IBVAP Final Audit, System Test, Security Review, and Demo-Readiness Report

Audit date: 2026-09-08  
Scope: repository, local MySQL data, backend API, Socket.IO, AI engine, controlled video pipeline, frontend production build, security/RBAC, storage, retention, and demo readiness.  
Verdict vocabulary: **PASS**, **FAIL**, **DEGRADED**, **BLOCKED**, and **NOT TESTED**.

## 1. Executive result

**Overall verdict: FAIL for an unqualified live SIH demo today.**

The implemented core is substantially real and internally coherent. Backend and AI automated suites pass, the frontend builds, the local MySQL schema and stored data are internally consistent, controlled video processing performs real detection/tracking/context/risk work, evidence exists on disk, and API-level RBAC is enforced. This is not a mock-only project.

However, a full live demonstration is not presently defensible because CAM-01 could not deliver frames, browser-level visual acceptance could not be executed in this environment, the Docker/README deployment path is stale, the map lacks geographic camera/zone data, ANPR has no dedicated plate detector and is honestly degraded, Redis is unavailable, and current dependency audits contain five moderate vulnerabilities. The Python environment also has an EasyOCR packaging inconsistency.

### Verified fixes made during this audit

- Forced new MySQL sessions to UTC and transactionally repaired the one proven legacy alert timestamp affected by the prior +330-minute session-timezone mismatch. Negative acknowledgement intervals changed from 1 to 0; no rows were deleted.
- Prevented invalid negative lifecycle intervals from contaminating analytics averages.
- Made rejected CORS origins return 403 instead of being misreported as internal 500 errors.
- Made ANPR health report `DEGRADED` when only heuristic localization is available, rather than incorrectly reporting full readiness.
- Made system health use live AI, RTSP/camera, ANPR, Redis, evidence-storage, Socket.IO, backend, and database state.
- Added evidence-storage visibility to the dashboard health component.
- Corrected a retention integration test that hard-coded a configuration restore value instead of restoring the actual prior value.
- Tightened local environment-file permissions to mode 600.
- Added regression coverage for database timezone handling, CORS denial, and RTSP health mapping.

### Final automated verification

- Backend: **236 passed, 0 failed**.
- AI engine: **350 passed, 0 failed**, with one upstream Starlette/httpx deprecation warning.
- Backend ESLint: **PASS**, zero warnings.
- Frontend production build: **PASS**, 1,021 modules transformed.
- Git whitespace/error check: **PASS**.
- Total automated tests: **586 passed, 0 failed**.

## 2. Final architecture summary

| Layer | Observed implementation | Verdict |
|---|---|---|
| Frontend | React/Vite SPA, authenticated routes, REST client, Socket.IO client, Leaflet map, role-aware actions | PASS with UI test gap |
| Backend | Express REST API, JWT auth, RBAC, rate limiting, Socket.IO, repositories/services, cleanup schedulers | PASS |
| Database | MySQL 8.4.11, 13 InnoDB tables, 22/22 migrations applied, 15 foreign keys, indexed query fields | PASS |
| AI engine | FastAPI, YOLO person/vehicle detection, ByteTrack, zones/fences, temporal context, risk engine, evidence, face and ANPR modules | PASS with degraded ANPR/live input |
| Live input | CAM-01 mobile RTSP configuration, reconnect/health machinery, tokenized preview proxy | BLOCKED: private source timed out and produced zero frames |
| Evidence | MySQL metadata plus restricted local storage for snapshots, clips, and face images | PASS |
| Cache | Optional Redis integration with fallback behavior | DEGRADED: Redis unavailable locally |
| Deployment | Dockerfiles plus top-level Compose and documentation | FAIL: Compose/README do not match the implemented MySQL ports/runtime |

The effective runtime flow is:

`camera/file -> decode/sample -> YOLO -> ByteTrack -> zone/fence/temporal context -> risk score -> backend internal API -> event/alert/evidence persistence -> REST/Socket.IO -> React UI`

The controlled-file path exercised this flow through real computer-vision processing. The live-camera path reached source construction and reconnection logic but could not proceed beyond frame acquisition.

## 3. End-to-end pipeline verdict

### Live CAM-01 path

**Verdict: BLOCKED.**

- CAM-01 exists, is enabled, is configured as a mobile RTSP source, targets 15 FPS, and applies 90-degree rotation.
- The AI service loaded YOLO on Apple MPS, ByteTrack, EasyOCR, YuNet face detection, four CAM-01 zones, two virtual fences, and five runtime-enabled risk rules.
- The source remained reconnecting/connecting. A direct media probe timed out and the preview proxy returned a prompt 502 rather than hanging or showing fake video.
- No frames, detections, tracks, events, alerts, or evidence can truthfully be attributed to the live CAM-01 attempt.
- System health correctly reports AI, camera/RTSP, ANPR, and Redis as degraded while backend, database, evidence storage, and Socket.IO are healthy.

### Controlled real-video path

**Verdict: PASS.** Two repository sample files were decoded and processed without synthetic detections or inserted mock results.

| Input | Processing result | Context/risk result | Output validation |
|---|---|---|---|
| `samples/test.mp4`, 736x414, 30 FPS, 539 frames, 17.97 s | 90 sampled/processed, 449 deliberately skipped, 0 dropped; 90 real person detections; one confirmed track | Restricted entry and loitering; risk progressed 25 LOW to 40 MEDIUM | Playable 1280x720 MPEG-4, 90 frames, 18.0 s |
| `samples/context_test.mp4`, 3840x2160, 25 FPS, 289 frames, 11.56 s | 58 sampled/processed, 231 deliberately skipped, 0 dropped; 146 detections (68 person, 78 vehicle); 8 tracks created, 5 confirmed | Separate track histories; restricted entry, exit, loitering, virtual-fence crossing, and fence proximity; risk reached 70 pending temporal HIGH confirmation | Playable 1280x720 MPEG-4, 58 frames, 11.6 s |

The second run observed four separate person track histories and did not conflate entry state across track IDs. Risk duplicate suppression also fired once. A score of 70 remained labeled MEDIUM because the engine's temporal confirmation guard for HIGH was not satisfied before the next meaningful emission/end; this is cautious severity behavior, not a fabricated result.

Face detection ran in detection-only mode and produced one observation without claiming recognition. ANPR heuristic localization made 38 OCR attempts and produced zero accepted plate observations. This is an honest negative result.

### Context and alert semantics

- Person detection is distinct from context events and suspicious-activity/risk events.
- Context events alone do not create actionable alerts.
- MEDIUM/HIGH/CRITICAL suspicious activity can create alerts when explainability fields are present.
- Active-alert deduplication, severity escalation, stream-session isolation, and same-track long-running escalation pass integration tests.
- `REPEATED_ENTRY` is implemented as a helper concept but is explicitly excluded from runtime rule mapping. Its database row is nevertheless enabled, which is misleading configuration and must be reconciled before the demo.

## 4. UI/UX verdict

**Verdict: DEGRADED; browser-level acceptance is NOT TESTED.**

Every requested SPA route returned the Vite application shell successfully, including login, dashboard, surveillance, CAM-01 details, events and unknown event details, alerts and unknown alert details, intelligence, map, analytics, admin, and profile. The production build also succeeds.

The environment did not expose the in-app browser control runtime required by the prescribed browser-testing workflow. Therefore component rendering, console/runtime errors, click flows, modal behavior, responsive layouts, actual dark/light presentation, and translation rendering were not guessed at and are classified **NOT TESTED**.

Source/API observations:

- Authentication guards, API-backed pages, safe not-found behavior, profile update, real-time hooks, role-aware actions, theme state, and English/localized label infrastructure are present.
- The public camera API and Socket.IO payloads do not expose raw RTSP credentials. Preview uses a short-lived tokenized backend URL.
- There is no event-acknowledgement route; acknowledgement correctly belongs to alerts. Any UI that suggests acknowledging a plain event would be semantically wrong.
- The map intentionally refuses normalized CCTV pixel coordinates as geographic latitude/longitude. Because the schema/data provide no geographic camera or zone coordinates, the map cannot display truthful camera/zone markers. An empty base map is preferable to fake placement, but it remains a demo gap.
- The main minified JavaScript chunk is 1,182.26 kB (327.21 kB gzip), triggering Vite's chunk-size warning.
- The frontend has no configured lint or automated test script. Route shell and production build checks do not replace visual/UI tests.

## 5. Security & RBAC verdict

**Verdict: FAIL overall because known dependency findings remain, although application RBAC and secret handling checks pass.**

### Passed controls

- Passwords in all four live user rows are bcrypt hashes; no placeholder or duplicate hashes were found.
- Seed logic does not embed a default production password; development users require explicit environment values.
- JWT missing, invalid, expired, and wrong-secret cases are rejected.
- Login failures and disabled accounts are handled safely; login rate limiting reaches 429.
- Internal AI endpoints require the service token.
- Public REST and Socket.IO camera payloads omit stream URLs and credentials.
- Environment files are ignored, untracked, and now mode 600. Backend and AI service tokens match without being exposed in this report.
- Helmet/security headers are present. Allowed loopback CORS preflight succeeds; a disallowed origin now receives 403.
- Malicious sort input, invalid dates, SQL field allowlists, evidence path containment, missing files, parent/camera mismatches, and idempotent evidence ingest are covered by passing tests.
- Destructive endpoints are administrator-only and clean-all requires the exact confirmation phrase.

### Verified role matrix

| Capability | Administrator | Security operator | Auditor/analyst |
|---|---:|---:|---:|
| Read assigned operational data | PASS | PASS, assignment-scoped | PASS |
| Read admin analytics/operator list | PASS | 403 | 403 where admin-only |
| Read audit logs | PASS | 403 | PASS |
| Acknowledge MEDIUM/HIGH alert | PASS | PASS | 403 |
| Acknowledge CRITICAL alert | PASS | 403 | 403 |
| Resolve operational alert | PASS | PASS | 403 |
| Change risk rules/users/assignments/retention | PASS | 403 | 403 |
| Protect/delete events or alerts | PASS | 403 | 403 |
| Run clean-all/audit cleanup | PASS with confirmation | 403 | 403 |

### Unresolved findings

- Backend `npm audit --omit=dev`: **3 moderate** advisories in the Express/body-parser/qs chain. The automated non-breaking fix did not clear them.
- Frontend `npm audit --omit=dev`: **2 moderate** React Router advisories. The proposed automated fix requires a breaking major upgrade to React Router DOM 7.18.3 and was not applied during a stabilization audit.
- Python `pip check`: EasyOCR 1.7.2 declares `opencv-python-headless`, while this environment has `opencv-python`. The engine and tests run, but the declared dependency graph is inconsistent.
- Untracked `screenlog` files are large and operationally noisy. They should be reviewed and excluded/removed before any commit or submission because runtime logs can contain environment-specific metadata.

No unsafe breaking dependency upgrade was made merely to produce a green audit number.

## 6. Storage & retention verdict

**Verdict: PASS, with real destructive clean-all intentionally NOT TESTED.**

### Live database state after final tests

- MySQL 8.4.11; session timezone `+00:00`; database clock offset from UTC: 0 minutes.
- 13 InnoDB tables; 22 migration files and 22 applied migrations; no pending migrations.
- 15 foreign keys and the expected unique/query indexes are present.
- Current counts: 4 users, 5 camera rows (one soft-deleted), 16 live events, 1 live alert, 3 evidence rows, 0 plates, 8 zones, 8 risk rules, and 2,000 audit-log rows.
- Duplicate email, camera code, event code, alert code, and person-event identity checks: 0.
- Orphan alert-event, evidence-parent, and plate-event checks: 0.
- Future event/alert/evidence timestamps: 0.
- Negative acknowledgement/resolve intervals: 0.
- The single live acknowledged MEDIUM alert now has a valid 623-second acknowledgement interval.

### Evidence integrity

- Three metadata rows exist: one snapshot, one incident clip, and one face image.
- All three files exist under the configured evidence root; none resolves outside it.
- Declared bytes and actual total bytes agree at 2,162,774.
- Authenticated media streaming, missing-file 404 behavior, idempotent ingest, and parent/camera validation pass tests.

### Retention behavior

- Configured caps/ages are coherent: normal-event cap 100; normal 48 h; medium 72 h; high 168 h; resolved alerts 168 h; evidence 168 h; critical 0 meaning keep; automatic cleanup every 60 minutes.
- The audit-log cap is exactly 2,000.
- Manual retention ran successfully with zero eligible operational rows and did not claim false deletions.
- Unit/integration tests verify age, severity, normal-event cap, protection, live-alert guards, orphan evidence files, resolved-alert cleanup, audit trimming, manual/automatic behavior, and role restrictions.
- Full live clean-all was **NOT TESTED** because it would deliberately destroy the user's operational dataset. Its authorization, confirmation guard, child-first ordering, configuration preservation, and safe storage-root logic pass automated tests/code inspection.

## 7. Performance and stability verdict

**Verdict: DEGRADED.**

- Local authenticated REST reads generally completed in roughly 1-9 ms; composite system health completed in about 26 ms.
- Controlled sample 1 averaged about 55.09 ms inference per processed frame, with 0 dropped processed frames.
- Controlled sample 2 averaged about 71.23 ms inference per processed frame, with 0 dropped processed frames.
- Sampling correctly skipped source frames to meet the configured processing rate; skipped frames were not misreported as decoder drops.
- The live RTSP reader failed fast/reconnected and the preview proxy returned promptly rather than hanging.
- Socket authentication, server-owned rooms, camera assignment isolation, safe payloads, and disconnect/release behavior pass tests.
- Redis fallback permits the core system to operate, but cache health is degraded.
- Docker Compose syntax parses with an obsolete-version warning, but the Docker daemon was unavailable and the defined ports/database do not match the current implementation, so container startup is **BLOCKED/FAIL**.
- Frontend bundle size and lack of code splitting are performance risks for constrained demo networks.

## 8. Test matrix

| Area | Method/evidence | Verdict |
|---|---|---|
| Repository merge conflicts | Index inspection | PASS |
| Repository whitespace errors | `git diff --check` | PASS |
| Repository cleanliness | Git status | FAIL: extensive pre-existing/untracked worktree changes |
| Backend unit/integration/API | Node test runner, serial integration | PASS: 236/236 |
| Backend lint | ESLint, zero warnings | PASS |
| AI unit/integration | Pytest | PASS: 350/350 |
| Frontend production compile | Vite build | PASS |
| Frontend automated tests | No test script | NOT TESTED |
| Frontend lint | No lint script | NOT TESTED |
| Browser visual acceptance | Required browser runtime unavailable | BLOCKED |
| SPA route fallback | HTTP GET of all named routes | PASS for shell delivery only |
| MySQL connectivity | Live connection | PASS |
| Migrations | Files vs applied records | PASS: 22/22 |
| Schema engine/FKs/indexes | Information schema audit | PASS |
| Duplicate/orphan integrity | Live SQL audit | PASS |
| Database timezone | Live session and lifecycle query | PASS after fix |
| Authentication | Live API plus integration tests | PASS |
| REST RBAC | Live role tokens plus tests | PASS |
| Socket.IO auth/RBAC | Integration tests | PASS |
| CORS rejection semantics | Regression test/live preflight | PASS after fix |
| Rate limiting | Integration test | PASS |
| Secret/stream URL exposure | Source scan and live payload checks | PASS |
| Node dependency security | Current npm audit | FAIL: 5 moderate total |
| Python dependency consistency | `pip check` | FAIL |
| CAM-01 configuration | DB/internal configuration checks | PASS |
| CAM-01 source reachability | Media probe and AI runtime | BLOCKED |
| CAM-01 preview failure behavior | Tokenized preview request | PASS: prompt 502 |
| YOLO model loading | Live AI logs/health | PASS |
| Person/vehicle detection | Controlled real videos | PASS |
| ByteTrack identity separation | Controlled video plus tests | PASS |
| Zone normalization/loading | DB/runtime audit | PASS |
| Restricted entry/exit | Controlled video plus tests | PASS |
| Virtual-fence crossing | Controlled video plus tests | PASS |
| Loitering progression | Controlled video plus tests | PASS |
| Fence proximity | Controlled video plus tests | PASS |
| Night movement | Tests and stored event data | PASS |
| Repeated entry | Runtime support map | DEGRADED: configured but intentionally unsupported |
| Risk scoring/explainability | Controlled video plus tests | PASS |
| Alert authority/dedup/escalation | Backend integration tests | PASS |
| Reconnection/session isolation | AI/backend tests and live failed-source behavior | PASS |
| Face detection | Controlled video and tests | PASS, detection-only |
| Face recognition | No gallery/positive recognition evidence | NOT TESTED |
| Dedicated ANPR | Model absent | BLOCKED |
| Heuristic ANPR | Real run, no accepted plates | DEGRADED |
| Event/alert persistence | Live DB and API | PASS |
| Evidence metadata/files | DB/disk/API audit | PASS |
| Retention scheduler/manual run | Live non-destructive run plus tests | PASS |
| Clean-all real execution | Avoided to preserve data | NOT TESTED |
| Analytics correctness | Live APIs, SQL comparison, negative-time guard | PASS after fix |
| System health truthfulness | Live status inspection | PASS after fix |
| Map marker correctness | No geographic source data | BLOCKED |
| Docker deployment | Compose inspection/parse; daemon unavailable | FAIL/BLOCKED |
| README/runbook accuracy | Compared with implementation | FAIL |

## 9. Demo readiness score

**68/100 — conditional prototype readiness, not full live-demo readiness.**

| Dimension | Score | Reason |
|---|---:|---|
| Architecture and data integrity | 16/20 | Real layered implementation; healthy schema; stale deployment path |
| Backend/API/realtime | 18/20 | Broad passing coverage and strong RBAC; optional cache unavailable |
| AI/context pipeline | 15/20 | Real detections/tracks/context/risk on files; live camera and dedicated ANPR unavailable |
| Security | 12/20 | Application controls are good; five moderate Node advisories and Python dependency inconsistency remain |
| UI/UX | 4/10 | Build/routes pass, but visual workflows were not executable and map has no geo data |
| Operations/presentation reliability | 3/10 | CAM-01 blocked, Docker/runbook stale, dirty/untracked submission tree |

The score is intentionally capped by the inability to demonstrate live acquisition and visually validate the application. A prerecorded controlled-video walkthrough could be shown honestly, but it is not equivalent to the requested full system demo.

## 10. Final recommendation

**Recommendation: NO-GO for a full live SIH presentation in the current state.**

A limited **GO** is reasonable only if the team explicitly presents the controlled-video pipeline, labels ANPR/Redis/live-camera/map limitations, and avoids claiming live RTSP success or browser flows that were not verified.

### Must complete before presentation

1. Restore CAM-01 reachability on the presentation network and run one recorded end-to-end live session: frames, detection, stable track, context, risk, event, alert, evidence, Socket.IO, acknowledgement, resolution, and reconnect.
2. Execute the full browser acceptance matrix as administrator, security operator, and auditor/analyst; check console errors, responsive layouts, modals, error states, theme, language, logout, and unknown-detail routes.
3. Replace or correct top-level Docker Compose and README so they describe the actual MySQL/backend/frontend/AI architecture, ports, environment setup, migrations, health checks, and presentation startup order.
4. Resolve or formally risk-accept the five moderate npm advisories and make the Python dependency graph pass `pip check` in a clean environment.
5. Install/validate the intended dedicated plate detector, or keep ANPR visibly marked degraded and remove plate-recognition claims from the demo script.
6. Add trustworthy geographic coordinates for map entities, or remove/map-label the feature as unavailable for this dataset.
7. Reconcile the `REPEATED_ENTRY` database rule with runtime support—disable it in stored configuration or complete and test its integration.
8. Clean the submission worktree: review untracked files, exclude runtime logs and generated artifacts, and make the final commit reproducible.
9. Reduce/code-split the frontend bundle and add at least smoke-level frontend lint/tests.

After those items, rerun the same 586 automated tests, production build, dependency checks, database audit, live CAM-01 scenario, and browser role matrix on the actual presentation laptop/network. Only then should the status be promoted to live-demo ready.
