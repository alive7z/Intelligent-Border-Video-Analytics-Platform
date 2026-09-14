# IBVAP Backend + Database Setup

Concise runbook for Phase 1 (foundation), Phase 2 (MySQL database), and
Phase 3 (authentication + JWT + RBAC).

## 1. Start MySQL

Ensure a local MySQL 8 server is running (e.g. via macOS MySQL install, Docker, or
your preferred method). The app connects on `DB_HOST:DB_PORT` (default `localhost:3306`).

## 2. Create the database and app user (one-time, as admin)

The application **never connects as root**. Use the dedicated dev user `ibvap_app`.

Edit `database/setup.sql` and replace `<DEV_PASSWORD>` with a local dev password,
then run it as a MySQL admin:

```bash
mysql -uroot -p < database/setup.sql
```

This creates:

- the `ibvap` database (utf8mb4)
- the `ibvap_app` user (localhost + 127.0.0.1)
- grants on `ibvap.*` to `ibvap_app`

## 3. Configure backend/.env

Copy `backend/.env.example` to `backend/.env` and set the DB password to the value
you chose in step 2:

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
API_PREFIX=/api

DB_HOST=localhost
DB_PORT=3306
DB_NAME=ibvap
DB_USER=ibvap_app
DB_PASSWORD=<DEV_PASSWORD>
DB_CONNECTION_LIMIT=10

# JWT (set a strong, random secret in backend/.env)
JWT_SECRET=<long-random-secret>
JWT_EXPIRES_IN=8h
```

`backend/.env` is git-ignored. Never commit real credentials. The JWT secret must
be long and unpredictable; do not use obvious values like `secret` or `123456`.

## 4. Install dependencies

```bash
cd backend
npm install
```

## 5. Run migrations

Creates the `schema_migrations` table and all core tables in numeric order.
Already-applied migrations are skipped.

```bash
npm run db:migrate
```

## 6. Run demo seed (development only)

Inserts demo users, cameras (incl. the `CAM-01` MOBILE demo camera), zones,
risk rules, and a few events/alerts. Safe to re-run (no duplicates).

```bash
npm run db:seed
```

## 7. Start the backend

```bash
npm run dev      # development (nodemon, auto-restart)
npm start        # production
```

On startup the server:

1. loads environment
2. tests the MySQL connection (`SELECT 1`) — aborts if unreachable
3. starts the HTTP server

## 8. Test health

```bash
curl http://localhost:5000/api/health
```

Expected (200 when MySQL is connected):

```json
{
  "success": true,
  "message": "IBVAP Backend is running",
  "data": {
    "service": "IBVAP API",
    "status": "healthy",
    "environment": "development",
    "database": { "status": "connected" },
    "uptime": 120,
    "timestamp": "ISO_DATE"
  }
}
```

If the database is unavailable, `/api/health` returns HTTP 503 with
`database.status: "disconnected"`.

## 9. Authentication (Phase 3)

Backend authentication uses JWT access tokens with Role-Based Access Control
(RBAC). Passwords are hashed with bcrypt (work factor 12). There is **no** public
registration endpoint — users are created by authorized administrators.

### Development / demo users

The Phase 2 demo rows (admin/operator/analyst) start with a placeholder hash. To
make them login-capable, provide each password via an environment variable and run
the user seed script (passwords are never stored or printed in plaintext):

```bash
cd backend
DEV_ADMIN_PASSWORD='<strong-password>' \
DEV_OPERATOR_PASSWORD='<strong-password>' \
DEV_AUDITOR_PASSWORD='<strong-password>' \
npm run db:seed-users
```

> If a `DEV_*_PASSWORD` is missing, that demo user is skipped rather than given a
> weak or plaintext password.

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "operator@ibvap.demo",
  "password": "<demo-password>"
}
```

Successful response (HTTP 200):

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": "8h",
    "user": {
      "publicId": "...",
      "fullName": "Demo Operator",
      "email": "operator@ibvap.demo",
      "role": "SECURITY_OPERATOR",
      "status": "ACTIVE"
    }
  },
  "errors": []
}
```

No `id` or `password_hash` is ever returned. Unknown email and wrong password both
return HTTP 401 `Invalid email or password` (no account enumeration). Inactive
accounts return HTTP 403. The login endpoint is rate limited (HTTP 429 on too many
attempts).

### Current user

Protected endpoint that returns the authenticated user:

```http
GET /api/auth/me
Authorization: Bearer <access-token>
```

Successful response (HTTP 200) returns the same safe `user` object as login.

### Bearer token usage

Protected routes expect the token in a standard `Authorization` header:

```
Authorization: Bearer <access-token>
```

- Missing token → HTTP 401 `Authentication required`
- Invalid/expired token → HTTP 401 `Invalid or expired token`
- Authenticated but insufficient role → HTTP 403 `Insufficient role permissions`

Tokens are short-lived (`8h`); refresh tokens, Redis, and server-side revocation
are intentionally out of scope for Phase 3.

## Phase 4 core APIs

All Phase 4 routes below require `Authorization: Bearer <access-token>`.

Role legend: `ALL` = every authenticated role (ADMIN, SECURITY_OPERATOR,
AUDITOR_ANALYST); `ADMIN` = ADMIN only; `ADMIN/OP` = ADMIN + SECURITY_OPERATOR;
`ADMIN/AUD` = ADMIN + AUDITOR_ANALYST.

Response conventions: list endpoints return `{ items, pagination }` where
`pagination = { page, limit, total, totalPages }`. Output fields use the database
(snake_case) column names, e.g. `camera_code`, `event_code`, `alert_code`,
`zone_code`, `evidence_code`, `rule_code`. Request bodies use camelCase
(e.g. `cameraCode`, `sourceType`).

### Cameras — `/api/cameras`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/cameras` | ALL | List cameras (filter: `status`, `sourceType`, `sector`, `search`, `enabled`, `page`, `limit`, `sort`) |
| GET | `/api/cameras/:cameraId` | ALL | Get one camera |
| GET | `/api/cameras/:cameraId/zones` | ALL | List zones for a camera |
| POST | `/api/cameras` | ADMIN | Create a camera |
| PATCH | `/api/cameras/:cameraId` | ADMIN | Update a camera |
| DELETE | `/api/cameras/:cameraId` | ADMIN | Delete a camera |

`stream_url` (may contain embedded credentials) is never returned in any camera
response. Read endpoints are allowed for all roles.

### Zones — `/api/zones`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/zones` | ALL | List zones (filter: `cameraCode`, `enabled`, `page`, `limit`) |
| GET | `/api/zones/:zoneCode` | ALL | Get one zone |
| POST | `/api/zones` | ADMIN | Create a zone |
| PATCH | `/api/zones/:zoneCode` | ADMIN | Update a zone |
| DELETE | `/api/zones/:zoneCode` | ADMIN | Delete a zone |

`coordinates` is an array of `{ x, y }` points (x/y in `0..1`) with at least 3
points; a camera (`cameraCode`) is required.

### Events — `/api/events`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/events` | ALL | List events (filter: `severity`, `type`, `status`, `minRiskScore`, `startDate`, `endDate`, `cameraId`, `page`, `limit`, `sort`) |
| GET | `/api/events/:eventCode` | ALL | Get one event |
| GET | `/api/events/:eventCode/evidence` | ALL | List evidence linked to an event |

Events are read-only (generated by processing); there is no create route.

### Alerts — `/api/alerts`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/alerts` | ALL | List alerts (filter: `status`, `severity`, `type`, `startDate`, `endDate`, `cameraId`, `page`, `limit`, `sort`) |
| GET | `/api/alerts/:alertCode` | ALL | Get one alert |
| POST | `/api/alerts/:alertCode/acknowledge` | ADMIN/OP | Acknowledge an alert |
| POST | `/api/alerts/:alertCode/resolve` | ADMIN/OP | Resolve an alert (body: `resolutionType`, `resolutionNotes`) |
| GET | `/api/alerts/:alertCode/evidence` | ALL | List evidence linked to an alert |

Alert state machine: `NEW/ACTIVE → ACKNOWLEDGED → RESOLVED` and
`ACKNOWLEDGED → RESOLVED`. Invalid transitions return HTTP 409. Acknowledge and
resolve write an audit entry.

### Evidence — `/api/evidence`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/evidence/:evidenceCode` | ALL | Get one evidence record (metadata) |

`file_path` (absolute/local path) is never exposed in metadata responses.
Evidence is also reachable via `GET /api/events/:eventCode/evidence` and
`GET /api/alerts/:alertCode/evidence`.

### Risk rules — `/api/risk-rules`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/risk-rules` | ALL | List risk rules (filter: `category`, `enabled`, `search`, `page`, `limit`) |
| GET | `/api/risk-rules/:ruleCode` | ALL | Get one risk rule |
| POST | `/api/risk-rules` | ADMIN | Create a risk rule |
| PATCH | `/api/risk-rules/:ruleCode` | ADMIN | Update a risk rule |

### Analytics — `/api/analytics`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/analytics/overview` | ALL | Total cameras/events/alerts |
| GET | `/api/analytics/events` | ALL | Events breakdown (severity, type, over time, per camera; `startDate`, `endDate`, `topN`) |
| GET | `/api/analytics/alerts` | ALL | Alerts breakdown (severity, status, over time, average risk) |
| GET | `/api/analytics/cameras` | ALL | Cameras breakdown (stream status, sector, alerts per camera) |

### Intelligence — `/api/intelligence`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/intelligence/summary` | ALL | India-day ANPR/face/vehicle KPIs and enabled camera count |
| GET | `/api/intelligence/overview` | ALL | Alias of `/summary` |
| GET | `/api/intelligence/plates` | ALL | List ANPR plate detections (filter: `plateText`, `cameraId`, `vehicleType`, `confidence`, `minConfidence`, `maxConfidence`, `date`, `startDate`, `endDate`, `page`, `limit`) |
| GET | `/api/intelligence/plates/:plateEventCode` | ALL | Get one plate detection |
| GET | `/api/intelligence/faces` | ALL | List detection-only face events and associated FACE evidence metadata |
| GET | `/api/intelligence/vehicles` | ALL | List stored `VEHICLE_DETECTED` events and session-linked plate OCR when available |

Plates reflect detected plate text only; no owner/blacklist/criminal data is
stored or returned. Face intelligence is queried from the existing
`FACE_DETECTED` event rows; no identity/recognition data or duplicate face table exists.

### Audit logs — `/api/audit-logs`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/audit-logs` | ADMIN/AUD | List audit entries (filter: `userId`, `action`, `entityType`, `startDate`, `endDate`, `page`, `limit`) |
| GET | `/api/audit-logs/:id` | ADMIN/AUD | Get one audit entry |

`SECURITY_OPERATOR` is denied (403) from reading audit logs.

### System — `/api/system`

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| GET | `/api/system/status` | ALL | Backend health probe + camera recorder state summary |

System status reports backend and database availability plus a
`cameras` `recordedState` list (ONLINE/OFFLINE/etc.) labeled as recorded state —
it does not claim live stream, Redis, or AI connectivity.

## Architecture note: events vs alerts

`events` and `alerts` are deliberately separate tables. A detection such as
"person detected" is an INFO event; only when risk rules/thresholds are exceeded
does it escalate to a security alert. Event/alert APIs arrive in later phases.

## Layout

```
backend/
  src/
    config/          env.js, cors.js, database.js (mysql2/promise pool)
    controllers/     health, auth, camera, zone, event, alert, evidence,
                     riskRule, intelligence, analytics, audit, system
    routes/          index.js (+ one router per resource above)
    middleware/      error, notFound, requestLogger, auth, role
    services/        auth, camera, zone, event, alert, evidence, riskRule,
                     intelligence, analytics, audit, system
    repositories/    user, camera, zone, event, alert, evidence, riskRule,
                     intelligence, analytics, audit, system
    utils/           ApiError, ApiResponse, asyncHandler, logger,
                     password, jwt, userSerializer, pagination, validation,
                     dbErrors, datetime, actor
    db/              migrate.js, seed.js, seed-users.js
database/
  migrations/        001..010 *.sql
  seeds/             demo_seed.sql
  schema.sql         complete Phase 2 schema
  setup.sql          one-time DB + app-user creation
```

Architecture is Route → Controller → Service → Repository → MySQL. Controllers
stay thin; all SQL lives in repositories and uses parameterized queries only.

## Realtime (Phase 6, Socket.IO)

Real-time updates are delivered over **Socket.IO** served on the **same HTTP
server as the REST API** (one process, one port — no separate WebSocket port).
`initializeSocket(server)` attaches the Socket.IO instance to the existing
`http.createServer`, so the client connects to the same origin/port it already
uses for REST. CORS is restricted to `FRONTEND_URL` with `credentials: true`.

### Connection & authentication

The client opens **one** socket per browser session. The JWT is passed via the
Socket.IO `auth` handshake field — never in the URL query string and never
logged:

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:PORT", {
  transports: ["websocket", "polling"],
  auth: { token: accessToken },
});
```

On connect the server (`socketAuth.js`):

1. reads the token from `socket.handshake.auth.token`;
2. rejects missing/invalid/expired tokens and tokens signed with a different
   secret;
3. resolves the user record (plus role) from the database — it never trusts
   any client-requested role or room;
4. rejects accounts that are not `ACTIVE`;
5. assigns rooms from the **database role** only.

A `connection:ready` event is emitted after successful authentication. Room
assignment is entirely server-driven; there is no client `join`/`leave` handler.

### Rooms by role

| Room | Membership |
|------|------------|
| `role:ADMINISTRATOR` | ADMINISTRATOR accounts |
| `role:SECURITY_OPERATOR` | SECURITY_OPERATOR accounts |
| `role:AUDITOR_ANALYST` | AUDITOR_ANALYST accounts |
| `user:<publicId>` | the single user (for direct addressing) |

### Event names & envelope

All events use the envelope `{ type, timestamp, data }`. Payloads are produced
by whitelist serializers (safeAlert/safeCamera/safeZone/safeRiskRule/safeEvent/
safeSystemStatus) that **never** include `stream_url`, credentials,
`password_hash`, or sensitive paths.

| Event | Audience | Carries |
|-------|----------|---------|
| `connection:ready` | the connecting socket | handshake info |
| `alert:new` | ADMIN + OPERATOR | safeAlert |
| `alert:acknowledged` | ADMIN + OPERATOR | safeAlert |
| `alert:resolved` | ADMIN + OPERATOR + ANALYST | safeAlert |
| `alert:updated` | ADMIN + OPERATOR + ANALYST | safeAlert |
| `event:new` | ADMIN + OPERATOR + ANALYST | safeEvent |
| `event:updated` | ADMIN + OPERATOR + ANALYST | safeEvent |
| `camera:status` | ADMIN + OPERATOR | safeCamera (no stream_url) |
| `camera:updated` | ADMIN + OPERATOR | safeCamera (no stream_url) |
| `zone:updated` | ADMIN | safeZone |
| `risk-rule:updated` | ADMIN | safeRiskRule |
| `system:status` | broadcast | safeSystemStatus |

Emission order: **REST mutation first, then socket emit only after the DB
commit/transaction succeeds** (alert acknowledge/resolve, camera/zone/risk-rule
updates). Never for rolled-back operations. `system:status` is not emitted on
REST health polls — it is reserved for future server-initiated pushes.

### Reconnect & data model

Socket.IO's built-in reconnection handles temporary backend/network drops. REST
remains authoritative for initial page data and for all mutations; the socket
delivers only incremental updates. Frontend listeners must unsubscribe on
component unmount (`socket.off`), and updates are deduplicated by stable ids
(`alert_code`/`event_code`/`camera_code`). No Redis, AI-engine, RTSP, or mobile
realtime is part of this phase.

## Phase 8: internal AI endpoint

The Python AI engine communicates with Node over an **internal, service-keyed**
endpoint. It is intentionally separate from the frontend business APIs and does
not use bearer JWTs.

### POST `/api/internal/ai/observations`

Authenticated by the `X-IBVAP-AI-Key` header, matched **timing-safe** against
`AI_SERVICE_TOKEN` (no token value is ever logged). Not enabled for public clients.

Request:

```json
{
  "schemaVersion": 1,
  "cameraCode": "CAM-01",
  "observations": [
    {
      "observationId": "uuid",
      "trackId": "2",
      "eventType": "PERSON_DETECTED",
      "objectType": "PERSON",
      "vehicleType": null,
      "confidence": 0.91,
      "occurredAt": "2026-08-31T12:00:00Z",
      "bbox": { "x1": 100, "y1": 80, "x2": 200, "y2": 300 }
    }
  ]
}
```

Behavior:

- validates `schemaVersion === 1`, the camera exists **and is enabled`;
- validates each observation (eventType/objectType/confidence range/bbox order/vehicleType);
- dedupes by `observationId` — a retried payload creates no duplicate row;
- creates an **INFO** event (`risk_score = 0`, `context.source = "AI_ENGINE"`) and
  emits `event:new` over Socket.IO to ADMIN + OPERATOR + ANALYST rooms;
- never creates alerts and never emits `alert:new`;

Responses: `200` with `{ eventsCreated }`, `400` validation/camera-disabled,
`401` missing/invalid key, `404` unknown camera.

### Security notes

- `AI_SERVICE_TOKEN` is shared between `backend/.env` and `ai_engine/.env`
  (`NODE_AI_SERVICE_TOKEN`) and defaults to a dev-only value; `NODE_INTEGRATION_ENABLED=false`
  by default so observation delivery is opt-in per environment.
- Timing-safe comparison is used for the token; secrets are never logged.

## Phase 12: internal ANPR + face endpoints

Phase 12 adds two internal, service-keyed AI endpoints for **license-plate (ANPR)** and
**face-detection** observations. Both are authenticated by the `X-IBVAP-AI-Key` header, match
timing-safe against `AI_SERVICE_TOKEN`, and are **observational only** — they carry bounding boxes
and confidence, never identity/ownership/legality, and are surfaced as INFO events with
`risk_score = null`. **They never create alerts and never emit `alert:new`.** Node remains the sole
alert authority.

### POST `/api/internal/ai/anpr-observations`

```json
{
  "schemaVersion": 1,
  "cameraCode": "CAM-01",
  "observations": [
    {
      "observationId": "uuid",
      "cameraCode": "CAM-01",
      "vehicleTrackId": "2",
      "plateText": "ABC-123",
      "rawText": "aBc-l23",
      "ocrConfidence": 0.93,
      "plateDetectionConfidence": 0.88,
      "occurredAt": "2026-08-31T12:00:00Z",
      "sourceTimestampMs": 1780000000000,
      "plateBBox": { "x1": 300, "y1": 560, "x2": 560, "y2": 620 }
    }
  ]
}
```

Behavior:

- validates `schemaVersion === 1`, `cameraCode` exists **and is enabled**;
- validates `plateText` against `/^[A-Z0-9-]{1,32}$/` and confidences/bbox within range;
- dedupes by `observationId` (via `eventRepository.findByObservationId`) — retries create no
  duplicates;
- inserts a row into the **`plates`** table (`plate_event_code`, `event_id`, `camera_id`,
  `vehicle_track_id`, `plate_text`, `ocr_confidence`, `vehicle_type`, `captured_at`) and creates a
  **`PLATE_DETECTED`** INFO event (`risk_score = null`, `context.source = "AI_ANPR_ENGINE"`),
  emitting `event:new` only; never `alert:new`;
- plate text is stored as OCR observation only — no owner/blacklist/criminal lookup.

Responses: `200` with `{ eventsCreated, platesCreated }`, `400` validation/camera-disabled, `401`
missing/invalid key, `404` unknown camera.

Read the persisted plates via `GET /api/intelligence/plates`.

### POST `/api/internal/ai/face-observations`

```json
{
  "schemaVersion": 1,
  "cameraCode": "CAM-01",
  "observations": [
    {
      "observationId": "uuid",
      "cameraCode": "CAM-01",
      "personTrackId": "5",
      "faceDetectionConfidence": 0.91,
      "occurredAt": "2026-08-31T12:00:00Z",
      "sourceTimestampMs": 1780000000000,
      "faceBBox": { "x1": 140, "y1": 120, "x2": 210, "y2": 205 }
    }
  ]
}
```

Behavior:

- validates `schemaVersion === 1`, `cameraCode` exists **and is enabled**;
- validates `personTrackId`, `faceDetectionConfidence` range, and `faceBBox`;
- dedupes by `observationId` — retries create no duplicates;
- creates a **`FACE_DETECTED`** INFO event (`risk_score = null`,
  `context.source = "AI_FACE_ENGINE"`, `context.detectionOnly = true`), emitting `event:new` only;
  never `alert:new`;
- **detection only** — no face table, no recognition/embeddings, no identity matching exposed.

Responses: `200` with `{ eventsCreated }`, `400` validation/camera-disabled, `401` missing/invalid
key, `404` unknown camera. Faces are persisted solely as `FACE_DETECTED` events via
`events.context_json`; there is **no** `faces` table.
