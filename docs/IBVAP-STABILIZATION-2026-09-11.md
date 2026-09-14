# IBVAP stabilization — 11 September 2026

## Current status

The changes below are implemented and regression-tested. **This is not full production/live-camera sign-off.** CAM-01/CAM-02 RTSP URLs are pending. No camera connections were initiated in this verification; existing source URLs and enabled flags were not changed. Earlier reports describe earlier snapshots, not verification of this revision.

**Border Map remains required and active.** `/map`, BorderMap, Dashboard preview, Leaflet, controls, filters, layers, legend, camera/alert markers, geographic zones/fences, popups and responsive map code are retained. Old instructions to remove/replace the map were overridden. Existing unrelated worktree edits were preserved.

## Implemented

| Area | Change |
| --- | --- |
| Multi-camera | Authenticated source discovery and explicit `--all-cameras` supervisor; one independent live pipeline per enabled configured camera. Stops removed/disabled sources without creating duplicate replacement workers. Single-camera/file modes retained. |
| Isolation | Per-camera health, preview, detector/tracker, context, risk, OCR, face and evidence state. Preview resolves the requested camera exactly. Discovery failure retains existing workers. |
| Stream safety | A timed-out native read is not force-released while active. Duplicate reads/reopens refused until it exits. Concurrent camera reads no longer hold a process-wide stderr lock for their full duration. |
| Bounded state | Latest-frame ingest, bounded timing/metric histories, short-miss track retention and expiry/session reset. |
| Deduplication | Deterministic event ids include camera/session/track/type. MySQL serializes alert decisions per camera and remembers completed decisions. Replays cannot reopen resolved incidents. Acknowledged/investigating unresolved incidents deduplicate. |
| Map data | Shared REST/socket normalization, no invented 0,0 coordinates, alert inheritance from its own configured camera only, geographic shapes separated from image ROIs, realtime active markers and open popups preserved. |
| Geographic configuration | Validated optional latitude/longitude and explicit neighboring camera codes in administration. Existing unknown locations remain unknown. |
| ANPR | Supported conventional Indian/BH full-format validation; reject fragments. Quality gate, high-quality first-read acceptance, two-second weighted consensus, recent same-camera registration suppression. Current agreeing frame supplies evidence/metadata. |
| Faces | Detection only, no identity recognition. Quality gates and at most three meaningfully improving crops per camera/session/person-track event; database cap tested concurrently. |
| Evidence | Event-linked plate and vehicle crops; stable crop identifiers with atomic non-overwriting file publication; traversal/symlink-escape prevention; shared custom evidence root support. |
| Explainability | Stored reasons remain visible. Rule weights are not invented additive points. Missing assessments are not labeled Clear. Timelines use recorded timestamps only; socket detail refresh does not erase stored reasons. |
| Event association | Real `/api/events/:eventCode/related` endpoint and Related Events panel: same-camera/session/track or explicitly configured neighbor with high-confidence validated matching registration/shared qualifying risk conditions, within two minutes. Assignment guards, stable pair ids, bounded 200-candidate query. No identity, movement-proof, new-alert or risk-change claims. |
| Setup/security | Demo seeding requires explicit nonproduction opt-in; SQL cannot override selected database. Test fixture preparation refuses a non-test environment/database. Local logs/captured frame ignored, not deleted. Patched qs 6.x override addresses the backend parser advisories. |

## Database and page-loading diagnosis

All migrations 001–024 were exercised on a fresh isolated MySQL 8.4 instance. The operational ledger originally contained 001–022. Only the two verified pending additive migrations were then applied:

- 023: nullable camera geographic configuration JSON.
- 024: add PLATE/VEHICLE evidence types without removing old types/data.

No operational seeds, cleanup, retention job or tests were run. No operational events/evidence were removed. Existing application processes were not restarted by this work.

Alerts, Events, Live Surveillance and Analytics all depend on the camera-list request. New repository code required `geographic_config` while the operational schema initially lacked it; the migration closes that schema/code mismatch. After migration, read-only authenticated checks against the running API returned HTTP 200 for all ten required endpoints: alerts/list+summary, events/list+summary, cameras, operators and analytics overview/events/alerts/cameras. The actual frontend service adapters were also executed against these APIs: **all four succeeded**. localhost and 127.0.0.1 browser origins were checked. The user subsequently confirmed that the pages load again; an actual browser was not available for independent inspection.

## Verified results

| Check | Result |
| --- | --- |
| Python regressions | **394 passed**, one Starlette/httpx deprecation warning. |
| Backend regressions | **247 passed**, isolated MySQL; includes concurrency, source discovery, geography, camera/session isolation, evidence caps, incident packaging and correlation guards. |
| Backend ESLint | PASS. |
| Frontend tests | **32 passed**, including map data/realtime, notifications, risk reasons, honest timelines and server-rendered evidence gallery checks. |
| Frontend build | PASS; existing large-bundle and Vite/module-format warnings. |
| Actual local weights | YOLO11n, YuNet and EasyOCR loaded on CPU; no camera or accuracy test implied. |
| Dedicated plate model | **MISSING**; HEURISTIC development mode, ANPR DEGRADED. |
| Backend production npm audit | **0 vulnerabilities** after compatible updates/override. Not a penetration test. |
| Frontend production npm audit | **2 moderate affected packages** (react-router/react-router-dom). Registry fix requires a major router migration; not force-upgraded. |
| Live cameras / sustained multi-camera load | NOT TESTED — URLs pending. Fault-injection tests are not live RTSP tests. |
| Browser map/mobile interaction | NOT TESTED in a browser; no browser-control tool available. |
| Formal model accuracy | NOT FORMALLY MEASURED. No precision/recall/OCR accuracy or sustained FPS claims. |
| Docker/deployment | NOT VERIFIED. Existing compose has obsolete PostgreSQL scaffolding; the active backend uses MySQL. |

## Startup / verification

Prerequisites: existing Node dependencies, Python 3.11 environment, MySQL, optional Redis, local model/OCR weights. Keep existing `.env` secrets; do not overwrite them with examples. Match backend `AI_SERVICE_TOKEN` and Python `NODE_AI_SERVICE_TOKEN`; delivery requires `NODE_INTEGRATION_ENABLED=true`. If customized, `EVIDENCE_BASE_PATH` must match between Node and Python. Keep Python loopback/internal, not internet-facing.

Read-only prerequisite check from repository root:

```bash
bash scripts/check-readiness.sh
```

It intentionally returns nonzero while dedicated plate weights are missing. It does not start ingestion, probe cameras or download models.

Backend, after verifying the configured DB target:

```bash
cd backend
npm ci --ignore-scripts
npm run db:migrate
npm start
```

API-only Python while camera URLs are pending:

```bash
cd ai_engine
VIDEO_SOURCE= .venv/bin/python main.py --serve
```

After reviewing **all** enabled stored sources and providing correct URLs, run one ingestion process (not beside an old process for the same cameras):

```bash
cd ai_engine
VIDEO_SOURCE= .venv/bin/python main.py --serve --all-cameras
```

For one scoped test use `--serve --camera-code CAM-01`. All-camera mode excludes VIDEO_FILE; file tests stay explicit `--video` workflows. Defaults: Node 5001, Python 8001, frontend 5173. Inspect `/api/health`, `/health` and authenticated runtime status; process health alone is not source readiness.

Frontend, separate terminal:

```bash
cd frontend
npm ci --ignore-scripts
npm run dev
```

Tests must use a disposable database with `ENV_FILE=/dev/null`, `NODE_ENV=test`, `DB_NAME` containing `_test`, explicit isolated DB credentials and test signing/service secrets. Run `db:migrate`, `db:prepare-test`, then `npm test` in backend. Never run legacy integration tests against operational data.

## Remaining limitations / unfinished requested capabilities

1. Supply CAM-01/CAM-02 sources and measure simultaneous throughput, frame age, memory, disconnect/reconnect, disable/re-enable and preview correctness over a sustained run. Review other enabled stored cameras before all-camera startup.
2. Supply compatible dedicated plate weights and labeled representative day/night/motion samples. Validate formats and tune quality/consensus thresholds against real false accepts/rejects. No guessed character substitutions were added.
3. Browser-test `/map` and Dashboard: zoom/pan/fullscreen, filters/layers/legend, all popups, realtime escalation/acknowledgement, resize/mobile and tile-unavailable behavior. Configure real coordinates/neighbor relations.
4. Adaptive **secondary-task** scheduling is implemented: measured-cost cooldowns, stale-frame skips and two prompt confirmation retries for uncertain ANPR. Core preview is published before secondary work; core detection/risk settings are unchanged. Individual OCR calls are not preemptible and live load is unmeasured. Shared-model/GPU scheduling is not implemented; per-camera mutable trackers remain isolated.
5. The on-screen incident package is implemented at `/api/alerts/:alertCode/package`, using bounded camera/session/track event history, real alert lifecycle/audit timestamps and linked evidence. Real images/clips replace sample identifiers and disabled playback controls. Missing history remains absent; no PDF/export system was introduced, as permitted by the brief.
6. HQ synchronization is **NOT ACTIVE**; no HQ endpoint/contract was supplied. Current bounded retries are not a proven persistent disk outbox across power loss. Offline basemap tiles are not provisioned; external tiles can fail offline while configured overlays remain active.
7. A native decoder call that never returns remains quarantined rather than force-released unsafely. Automatic per-camera process termination/recovery for that condition is not implemented.
8. Frontend router major-version remediation, dev-dependency/Python security audits and deployment hardening remain unverified. Evidence post-incident recording completeness also needs real-stream validation; existing buffering is not proof of a complete post-roll clip.

No map code or operator evidence was deleted. Implemented code, automated verification and untested capabilities are deliberately distinguished.

## Subsequent verification

The user confirmed that Alerts, Events, Live Surveillance and Analytics load again. Read-only smoke checks after the subsequent changes still returned HTTP 200. No active operational alert was available for an on-screen package smoke test; package linkage/access tests used only the isolated database. See [the innovation acceptance report](IBVAP-INNOVATION-ACCEPTANCE-2026-09-11.md) for the required feature-by-feature results.

New configuration defaults in Python: `ADAPTIVE_SECONDARY_ENABLED=true`, `SECONDARY_BUDGET_FRACTION=0.25`, `SECONDARY_MAX_FRAME_AGE_MS=1500`. Diagnostics appear in per-camera health/Redis runtime and Camera Details. Unknown decoder FPS no longer bypasses the configured target sampling rate. Same-tier higher risk updates refresh the alert's actual factors without a new severity notification or loss of acknowledgement. Alerts are prioritized by severity with deterministic newest-first ties; all filter options remain available.
