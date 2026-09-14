# IBVAP — FINAL SYSTEM VERIFICATION REPORT

**Date:** 01 Sep 2026 (session-time: 16:40–16:58 UTC)
**Scope:** Full-stack integration audit of the Node.js backend + React frontend + FastAPI AI engine + MySQL. Single consolidated report covering every subsystem required.
**Environment:** macOS; MySQL 8.4.11 @ localhost:3306; backend PID 74192 @ `http://localhost:5001`; Python AI PID 74142 @ `http://localhost:8001`. **No Redis binary and no Docker daemon are available in this environment** → those items are verified by graceful-degradation checks and marked `BLOCKED` for infra-level confirmation.

**Verdict summary**

| Area | Result | Key evidence |
|---|---|---|
| Config/environment alignment | **PASS** | Port 5001 canonical everywhere; service tokens match (48 chars) |
| Database schema & integrity | **PASS** | 10 migrations applied; FKs mapped; test residue removed (0 rows) |
| Auth + RBAC | **PASS** | JWT; AI-key gate on internal routes; admin-only write ops (403 tested) |
| API contract (no streamUrl leaks) | **PASS** | Canonical camelCase; verified by tests + live curl |
| Runtime status + cache headers | **PASS** | honest RECONNECTING; `no-store` live-verified |
| Preview / MJPEG security | **PASS** | 401 anon, 502-in-2ms offline (was infinite hang) |
| Socket.IO realtime | **PASS** | `camera:status` emit bug fixed; subscriptions verified |
| Security review | **PASS** | No SQLi, no credential leak, evidence path confinement added |
| Frontend integration | **PASS** | null ms/FPS, /100, route guard, ESM fix; build OK |
| Automated regressions | **PASS** | Backend 164/164 + lint clean; Python 292/292; frontend build OK |
| Live phone-camera video, Redis, Docker | **BLOCKED** | external requirements; manual steps below |

---

## 1. Verification Method & Environment

- Source audit of `backend/src`, `frontend/src`, and `ai_engine` (routes, services, repositories, realtime, preview, health).
- **Live** checks against the running `/api` on 5001 and Python `/health` on 8001 (login, runtime-status, preview-token, preview proxy, camera list, health).
- Automated suites: `backend npm test`/`npm run lint`, `ai_engine pytest`, `frontend vite build`.
- Database integrity probes (FK map, orphan scan, camera/event/evidence counts).

## 2. Configuration & Environment Alignment — PASS

- **Port fix applied:** `backend/.env` and `backend/.env.example` now `PORT=5001` (was `5000`); frontend `.env.example` comment aligned. Frontend `VITE_API_BASE_URL=http://localhost:5001/api`, `VITE_WS_URL=http://localhost:5001`; Python `NODE_API_URL=http://localhost:5001/api`.
- API base centralized in `frontend/src/services/api.js` (`buildUrl` collapses `/api/api`).
- `backend AI_SERVICE_TOKEN` == `ai_engine NODE_AI_SERVICE_TOKEN` (length 48). `PREVIEW_TOKEN_SECRET` falls back to `JWT_SECRET` in env (documented; both present).
- Live `GET /api/health`: healthy, MySQL connected, redis degraded, preview enabled, alertManager READY.

## 3. Database Schema & Data Integrity — PASS

- 10 migrations (`schema_migrations` all applied). 13 tables: alerts, audit_logs, cameras, events, evidence, plates, risk_rules, schema_migrations, system_health, users, zones (+2 views in schema).
- FK map verified (no CASCade; RESTRICT/SET NULL); correct child-before-parent deletion order.
- Cameras present: `CAM-01 .. CAM-03, CAM-05, CAM-06` (5). Seeds define CAM-01..08; CAM-04/07/08 not present in this DB (pre-existing state, not altered).
- Risk rules (6), zones (8), demo users: admin/operator/analyst (ADMINISTRATOR/SECURITY_OPERATOR/AUDITOR_ANALYST).
- **Test-data cleanup applied:** `CAM-ALERT-1` was a `backend/tests/alertManager.test.js` fixture (not in seeds) that had leaked into the live DB with 21 events + 4 evidence + grid visibility. Removed via FK-safe cascade; `alertManager.test.js` `before` now also deletes evidence by camera, and the `after` hook reordered to delete alerts before events before camera. Post-run residue: **0 cameras, 0 events, 0 evidence, 0 orphans**.

## 4. Authentication, Authorization & RBAC — PASS

- `/api/auth/login`, `/api/auth/me`; JWT in `Authorization: Bearer`.
- `/api/cameras` POST/PATCH admin-only; operator create → **403** (tested). Unauthenticated → **401** (tested).
- All `/api/internal/*` gated by `X-IBVAP-AI-Key` (`authenticateAiService`); `GET /api/preview/:token` intentionally public (HMAC-bound).
- Route-level role guard added in the frontend: `/admin` now requires `ADMINISTRATOR` in `ProtectedRoute` (in addition to existing component-level AccessDenied).

## 5. API Contract Integrity — PASS

- Canonical camelCase shape everywhere from `camera.service.toSafeCamera` (id, cameraCode, name, locationName, sector, sourceType, streamProtocol, streamStatus, aiStatus, enabled, lastSeenAt, createdAt, updatedAt). `stream_url`/`streamUrl` never serialized publicly (unit tests `phase4`/`camera.phase13` assert omitted; live `GET /api/cameras` payload scanned: no `stream_url|streamUrl|rtsp://|rtsps://`).
- `sourceConfig.service` (internal, AI-key) is the only route that returns `streamUrl`.
- `preview-token` payload decodes to `CAM-01.<expiryMs>` (verified earlier); unknown/expired/tampered tokens → 401/404 (tests).

## 6. Live Streaming & Runtime Status — PASS (live camera: BLOCKED)

- `runtime-status` reads Redis first, then **always** consults Python `/health` when no runtime entry is present (fix applied: Redis is a cache, a missing/expired key is not authoritative), and reports `redisAvailable` truthfully.
- **Cache headers fixed:** `Cache-Control: no-store` added to `runtime-status` and `preview-token` (live-verified on both).
- Live now (phone OFF): `runtime-status CAM-01` → `streamStatus=NOT_CONFIGURED (DB)`, `runtime.status=RECONNECTING`, `live=true`, `redisAvailable=false` — honest, never a fake ONLINE.
- **BLOCKED (external):** live video requires the demo phone to broadcast. Manual steps once the phone is online, in §13.

## 7. Preview Token & MJPEG Stream Security — PASS

- HMAC-signed token (SHA-256, base64url), millisecond expiry both sides; single purpose; token via authenticated endpoint only.
- Public proxy `GET /api/preview/:token` streams `multipart/x-mixed-replace`; no buffering (chunk passthrough), upstream destroyed on client close, `Cache-Control: no-cache`.
- **Honest-stream fix (both services):**
  - Python `/internal/preview/<code>` now returns **409** when the stream is not `ONLINE` (was minting an empty MJPEG with zero frames).
  - Node proxy now has an 8 s stall watchdog and fails fast.
  - Live result while phone offline: preview request → **502 in ~2 ms** (`Preview unavailable`) instead of hanging forever.
- Anonymous/tampered token → **401**; tests added: `tests/test_preview_mjpeg.py` (5 tests).

## 8. Socket.IO Realtime — PASS

- Canonical events (frozen in `events.js`): `event:new/updated`, `alert:new/updated/acknowledged/resolved`, `camera:status/updated`, `zone:updated`, `risk-rule:updated`, `system:status`, `connection:ready`.
- **Bug fixed:** `camera:status` was never emitted because `updateCamera` compared `data.stream_status` (snake) against the DB; the payload key is `streamStatus` (camel). Now compared correctly, so status changes emit `camera:status`, otherwise `camera:updated`.
- Frontend subscriptions verified for `event:new`, `alert:new/updated/acknowledged/resolved`, `camera:status/updated` on the pages that consume them (Dashboard, Surveys, Details, Events, Alerts, BorderMap). Notes: `zone:updated`, `risk-rule:updated`, `system:status`, `connection:ready` are declared but not yet wired (harmless).

## 9. Data Flow End-to-End — PASS (video leg BLOCKED)

- Verifiable today: AI `/health` → backend runtime-status; authenticated login → camera list/detail/update; preview token issue → MJPEG proxy path (502 offline, 4.5 MB streamed when the phone was online earlier); internal `risk-observations` → events/alerts/evidence + socket emissions (covered by backend integration tests).
- Cannot drive a live frame today (phone off) → legacy of the video pipeline is covered by the 292 Python tests and the online capture earlier.

## 10. Security Review — PASS (notes)

- SQL injection: all repositories parameterized; dynamic sort fields whitelist-validated.
- RTSP credentials never reach the browser (masked `rtsp://***.configured` in admin UI; raw URL only in AI-keyed internal route).
- **Evidence path confinement added:** `storageReference` must be a relative path (rejects `..`, absolute paths, backslashes, URI schemes). No evidence file-serving route exists today (latent only).
- Error middleware: no stack traces in production; 404 handler present. Notes (not blocking): an *operational* 500 ApiError would disclose its message verbatim in production; `unhandledRejection` logs but does not exit.
- `streamUrl` validation/protection added: create/update reject schemes outside `rtsp|rtsps|http|https`; update with empty/none preserves the stored URL (never wipes).

## 11. Frontend Integration — PASS

Fixes applied:
- `adminApi.disableCamera` fallback now uses camel `streamStatus` (was `stream_status` → all-undefined row).
- `CameraInfoPanel` guards null FPS/latency (killed the "null ms" display).
- `api.js` replaces `require()` with top-level ESM imports so 401 actually clears the token.
- `ProtectedRoute` optional `roles` + `/admin` role gate.
- Risk Score renders `—` instead of `null/undefined` (`AlertInformation`, `AlertInformation`-style cards, `EventDetailsCard`, `EventRiskContext`, `SelectedMapItem`, `AlertPopup`).
- `CameraPopup` formats ISO timestamps with `formatTime` (was raw ISO via `.split(" ").pop()`).

Page-state audit: Dashboard, LiveSurveillance, CameraDetails, Alerts, AlertDetails, Events, EventDetails, Intelligence, BorderMap, Analytics, Login all have loading + error + empty states; invalid camera id shows controlled "not found". No hardcoded origins in components. Build passes.

## 12. Test & Regression Matrix — PASS

| Suite | Result |
|---|---|
| Backend `npm test` (node:test, concurrency 1) | **164 passed / 0 failed** |
| Backend `npm run lint` (eslint, max-warnings=0) | **clean** |
| Python `pytest -q` | **292 passed / 0 failed** (incl. 5 new preview tests) |
| Frontend `npm run build` (vite) | **succeeds** (pre-existing chunk-size warning only) |
| DB residue scan | **0** CAM-ALERT-1 cameras/events/evidence; **0** orphan evidence |

## 13. Blocked Items & Manual Re-verification Steps

1. **Live phone camera video (CAM-01)** — `BLOCKED BY EXTERNAL`. When the phone broadcasts again:
   1. `curl http://localhost:8001/health` → expect `stream.status: ONLINE`.
   2. `curl -H "Authorization: Bearer <token>" http://localhost:5001/api/cameras/CAM-01/runtime-status` → `runtime.status=ONLINE`.
   3. `curl -H "Authorization: Bearer <token>" http://localhost:5001/api/cameras/CAM-01/preview-token →` open returned URL in a browser → expect flowing MJPEG (multipart/x-mixed-replace). Offline now, this returns a clean 502 in ~2 ms (verified).
2. **Redis** — not installed; container check impossible. Verified graceful degradation: `/api/health` reports `redis.degraded`, services never fail, runtime falls back to Python authority, `redisAvailable=false` reported honestly.
3. **Docker / nginx / Prometheus / Grafana (infra)** — Docker daemon unavailable in this environment → infra deployment checks `BLOCKED`.
4. **Browser UI walkthrough** — recommended against the built `frontend/dist` with backend :5001 (or `npm run dev`) to eyeball grid statuses ("Reconnecting" badge), alert flows, and admin create-camera with masked URL.