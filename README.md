# IBVAP — Intelligent Border Video Analytics Platform

IBVAP turns CCTV observations into contextual events, prioritized alerts, and reviewable evidence. It combines a Python vision engine, a Node.js application backend, and a React command dashboard to support border-surveillance workflows.

The core workflow is **detection → tracking → context → risk → alert → evidence → operator action**. A person or vehicle detection is an observation; configured context and risk rules determine whether it needs operator attention.

Developed for the Smart India Hackathon 2026 context, this repository is a prototype and research implementation. Camera accuracy, capacity, and operational readiness require validation in the intended deployment environment.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Camera ingestion and models](#camera-ingestion-and-models)
- [Optional evidence ledger](#optional-evidence-ledger)
- [Testing and checks](#testing-and-checks)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Features

| Area | Capabilities |
| --- | --- |
| Live surveillance | RTSP and HTTP/MJPEG camera ingestion, local video processing, annotated previews, reconnect handling, and camera status |
| Detection and tracking | Person and vehicle detection with YOLO; object tracking with ByteTrack |
| Context and risk | Zone entry, virtual-fence crossing, fence proximity, loitering, night movement, and configurable risk scoring |
| Events and alerts | Searchable observations, risk explanations, acknowledgement and resolution workflows, and realtime updates |
| Intelligence | Vehicle observations, number-plate localization and OCR, and face-detection observations |
| Evidence | Snapshots and crops linked to events and alerts, retention controls, integrity verification, and custody records |
| Command dashboard | Operational summaries, live surveillance, analytics, a Leaflet border map, and English/Hindi interface text |
| Administration | Users, operator assignments, cameras, zones, risk rules, audit logs, retention, and system health |
| Authentication | JWT access tokens, backend role checks, account security controls, and MFA endpoints |
| Integrity ledger | Optional local permissioned ledger for evidence digests and audit-batch Merkle roots |

Face processing performs **detection only**, without identity matching or facial recognition. Plate and face observations do not establish a person's identity or make an activity suspicious by themselves.

The application uses three primary roles: `ADMINISTRATOR`, `SECURITY_OPERATOR`, and `AUDITOR_ANALYST`. Backend routes enforce permissions in addition to the interface's access controls.

## Architecture

```text
RTSP / HTTP / MJPEG cameras or local video
                    |
                    v
          Python vision engine
     detection, tracking, context, risk
          |                    |
          | observations       | media files
          v                    v
     Node.js / Express       Evidence storage
     APIs and alert manager     |
          |                    |
          +---- MySQL: records, metadata, custody
          +---- Redis: optional runtime state
          +---- Optional ledger: digests and audit roots
          |
          | REST, Socket.IO, authenticated preview proxy
          v
        React command dashboard
```

- **Python** processes frames and sends observations to the backend through internal APIs.
- **Node.js** owns application permissions, persistent records, and alert creation. The AI engine does not write directly to MySQL.
- **MySQL** stores structured data. Evidence media lives in filesystem storage; Redis holds optional transient state.
- **The browser** uses backend APIs and a token-protected preview proxy. Raw camera stream credentials remain on the server side.
- **The ledger** anchors integrity records; it does not replace the application database or media storage.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, React Router, Leaflet, Recharts |
| Backend | Node.js, Express, Socket.IO, mysql2 |
| AI service | Python, FastAPI, Ultralytics YOLO, PyTorch, OpenCV, ByteTrack |
| Secondary analysis | EasyOCR for plate text; YuNet for face detection |
| Persistence | MySQL 8, local evidence storage, optional Redis |
| Integrity | SHA-256, Ed25519 evidence signatures, custody hash chains, Merkle roots |
| Tests | Node.js test runner, Supertest, pytest |

Dependency versions are defined in the component package manifests, npm lockfiles, and [AI requirements](ai_engine/requirements.txt).

## Project structure

```text
.
├── frontend/              # React dashboard, pages, components, and API clients
├── backend/               # Express APIs, services, repositories, and security
├── ai_engine/             # Detection, tracking, context, risk, OCR, and streaming
├── database/              # MySQL setup, migrations, and development seeds
├── ledger/                # Python integrity-ledger demo and launch resources
├── storage/               # Runtime evidence media
├── docs/                  # Setup guides, architecture, and verification reports
├── scripts/               # Development and readiness checks
├── infra/                 # Infrastructure resources
└── docker-compose.yml     # Legacy infrastructure scaffold
```

## Local setup

The commands below use a POSIX shell. Run component commands from the directory shown so their `.env` files resolve correctly.

### 1. Prerequisites and clone

- Node.js and npm; the backend manifest requires Node.js 18 or later.
- Python 3.11 with virtual-environment support, as documented by the AI engine.
- A running MySQL 8 server and permission to create a development database/user.
- Redis if runtime caching is enabled; otherwise set `REDIS_ENABLED=false` in both backend and AI configuration.
- Local model weights and an authorized video source for inference. The dashboard and API can start before camera ingestion is configured.

```bash
git clone https://github.com/alive7z/Intelligent-Border-Video-Analytics-Platform.git
cd Intelligent-Border-Video-Analytics-Platform
```

**Docker status:** the root Compose file is an older scaffold that declares PostgreSQL and different service ports. The current backend uses MySQL. Use the component setup below; the root file is not a working full-stack quick start.

### 2. Create component configuration

For a fresh checkout:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ai_engine/.env.example ai_engine/.env
```

Keep existing `.env` files if the project is already configured. Component files are authoritative; the root `.env.example` is a topology reference.

Set these values before starting services:

| File | Setting | Purpose |
| --- | --- | --- |
| `backend/.env` | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `backend/.env` | `JWT_SECRET` | Random secret for access-token signing |
| `backend/.env` | `AI_SERVICE_TOKEN` | Shared credential for internal AI requests |
| `backend/.env` | `PREVIEW_TOKEN_SECRET` | Separate random secret for browser preview tokens |
| `backend/.env` | `AI_INTERNAL_URL=http://localhost:8001` | Internal AI service address |
| `backend/.env` | `BLOCKCHAIN_ENABLED=false` | Keep ledger integration disabled until a node is configured |
| `ai_engine/.env` | `NODE_AI_SERVICE_TOKEN` | Must match backend `AI_SERVICE_TOKEN` |
| `ai_engine/.env` | `NODE_API_URL=http://localhost:5001/api` | Backend API address |
| `ai_engine/.env` | `NODE_INTEGRATION_ENABLED=true` | Deliver observations to the backend |
| `frontend/.env` | `VITE_API_BASE_URL=http://localhost:5001/api` | Browser API address, including `/api` |
| `frontend/.env` | `VITE_WS_URL=http://localhost:5001` | Socket.IO address |

Generate a separate value for each secret, for example with `openssl rand -hex 32`. Never put secrets in `VITE_*` variables: those values are bundled into browser code.

### 3. Prepare MySQL

Review [database/setup.sql](database/setup.sql). Using a local copy, replace its `<DEV_PASSWORD>` placeholders with the password configured in `backend/.env`, then execute that copy as a MySQL administrator:

```bash
mysql -u root -p < /path/to/your/local-setup.sql
```

The script creates `ibvap`, the dedicated `ibvap_app` user, and the necessary grants. Keep the credential-bearing copy outside version control.

Install backend dependencies and apply migrations:

```bash
cd backend
npm ci
npm run db:migrate
```

For a **disposable development database**, optional demo fixtures can be loaded with:

```bash
ALLOW_DEMO_SEED=true npm run db:seed
```

The seed requires this explicit flag. Skip it for operational data.

Create login-enabled development users with passwords you supply:

```bash
DEV_ADMIN_PASSWORD='<your-admin-password>' \
DEV_OPERATOR_PASSWORD='<your-operator-password>' \
DEV_AUDITOR_PASSWORD='<your-analyst-password>' \
npm run db:seed-users
```

| Account | Role |
| --- | --- |
| `admin@ibvap.demo` | `ADMINISTRATOR` |
| `operator@ibvap.demo` | `SECURITY_OPERATOR` |
| `analyst@ibvap.demo` | `AUDITOR_ANALYST` |

There is no shared default password. The script skips accounts without a supplied password and updates the password for supplied accounts when rerun.

### 4. Start the backend

In a terminal, from `backend/`:

```bash
npm run dev
```

The default API address is `http://localhost:5001/api`. For a process without the development file watcher, use `npm start`.

### 5. Install and start the AI service

In another terminal, from the repository root:

```bash
cd ai_engine
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python main.py --serve
```

With `VIDEO_SOURCE` empty, this starts the API without ingestion. The default AI address is `http://127.0.0.1:8001`. Use one of the ingestion commands below when ready to process video.

### 6. Start the frontend

In another terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173` and sign in with a user configured above.

### 7. Check service health

```bash
curl http://localhost:5001/api/health
curl http://127.0.0.1:8001/health
```

From the repository root, run the dependency and model readiness check:

```bash
bash scripts/check-readiness.sh
```

Readiness checks do not start ingestion or verify live-camera accuracy. An API health response alone does not establish that a camera is delivering frames.

## Camera ingestion and models

Model loading uses local files. Provision the required assets before starting inference:

| Asset | Configuration |
| --- | --- |
| Main YOLO object detector | `YOLO_MODEL`, default `yolo11n.pt` |
| Dedicated plate detector | `ANPR_MODEL_PATH`, default `license_plate_detector.pt` |
| YuNet face detector | `FACE_MODEL_PATH`, default `face_detection_yunet_2023mar.onnx` |
| EasyOCR recognition models | EasyOCR's local model cache; runtime downloads are disabled |

The default weights directory is `ai_engine/models/weights/`. See the [AI guide](ai_engine/README.md) and [plate-model provenance](ai_engine/models/weights/README.md) for additional context. Model availability and secondary-feature readiness are reported separately; do not assume OCR is ready simply because the main detector loaded.

Run **one** of the following from `ai_engine/` with its virtual environment active, replacing the API-only process if it already occupies port 8001:

```bash
# Local video: supply your own clip and an appropriate AI_CAMERA_CODE.
python main.py --video samples/test.mp4

# One camera configured in the application's camera administration.
python main.py --camera-code CAM-01

# Discover and supervise enabled live cameras from the backend.
python main.py --all-cameras
```

Leave `VIDEO_SOURCE` empty for live-camera modes. Configure each camera's source URL, enabled state, zones, and rules in the application. The single-camera command fetches its source configuration from the backend; the camera code must exist there.

The engine supports RTSP and HTTP/MJPEG sources through its streaming pipeline. ONVIF discovery is not part of these startup instructions. Camera-frame coordinates used for zones and fences are distinct from latitude/longitude on the border map.

## Optional evidence ledger

The backend includes SHA-256 evidence hashing, Ed25519 signatures, custody records, and optional ledger anchoring. The bundled Python ledger is a local demonstration using HMAC-authorized blocks, hash links, and peer replication. It is not a production distributed-consensus system.

For a single local node, run from `ledger/`:

```bash
export LEDGER_NODE_TOKEN='<your-local-ledger-token>'
python3 ledger.py --node-id BOP --port 8541 --chain-id 51201
```

Set matching backend values and restart the backend:

```dotenv
BLOCKCHAIN_ENABLED=true
LEDGER_RPC_URL=http://127.0.0.1:8541
LEDGER_NODE_TOKEN=<same-local-ledger-token>
LEDGER_CHAIN_ID=51201
EVIDENCE_INTEGRITY_ENABLED=true
```

Evidence files remain off-chain. The ledger records digests and anchoring metadata. Pending anchors can be retried through the backend security workflow when the ledger becomes available.

For persistent deployments, configure stable signing keys using `EVIDENCE_SIGNING_PRIVATE_KEY`, `EVIDENCE_SIGNING_PUBLIC_KEY`, and `EVIDENCE_SIGNING_KEY_ID`. The fallback development signing key is generated in memory. Review master-key configuration before enabling encryption or MFA workflows.

The ledger binds to loopback in the current implementation. The supplied ledger Compose resources require networking review before container-based use. See [integrity documentation](docs/blockchain-integrity.md) and the [on-chain/off-chain matrix](docs/onchain-offchain-matrix.md) for design context; current route and configuration source files define implemented behavior.

## Testing and checks

### Frontend

From `frontend/`:

```bash
npm test
npm run build
```

The build output is `frontend/dist/`. It is generated output and is not committed.

### AI engine

From `ai_engine/`, with the virtual environment active:

```bash
python -m pytest
```

Automated tests complement camera validation; they do not establish field detection or OCR accuracy.

### Backend

From `backend/`:

```bash
npm run lint
```

Integration tests require a **separate disposable MySQL database**, such as `ibvap_test`, with its own grants. They modify data and must not use the operational database.

In a dedicated test shell, configure isolated credentials and secrets before running migrations and tests:

```bash
export ENV_FILE=/dev/null
export NODE_ENV=test
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=ibvap_test
export DB_USER=ibvap_test_user
export DB_PASSWORD='<test-database-password>'
export JWT_SECRET='<test-only-signing-secret>'
export AI_SERVICE_TOKEN='<test-only-service-token>'
export PREVIEW_TOKEN_SECRET='<test-only-preview-secret>'
export REDIS_ENABLED=false
export BLOCKCHAIN_ENABLED=false

npm run db:migrate
npm run db:prepare-test
npm test
```

Provision the test database and user first. Some security integration tests also launch a local Python ledger, so `python3` and a free test port are required. Historical test counts and environment limitations are recorded in the linked reports below; they are not a guarantee that the current checkout passes every check.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Backend cannot connect to MySQL | Confirm the server, database, dedicated-user grants, and `DB_*` values; run commands from `backend/`. |
| Login fails after setup | Run `db:seed-users` with the intended account's password variable; demo fixtures alone do not establish usable login passwords. |
| Browser API or Socket.IO requests fail | Confirm ports 5173/5001, frontend URLs, and backend `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS`; restart Vite after changing its environment. |
| AI API responds but there is no preview | Start an ingestion mode and verify the camera source, model readiness, service-token match, and `AI_INTERNAL_URL`. |
| Model or OCR is unavailable | Check local weights and the EasyOCR cache with the readiness script; startup does not fetch missing models. |
| Redis is unavailable | Start Redis or explicitly disable it in both components for local use. |
| Ledger anchors remain pending | Check `BLOCKCHAIN_ENABLED`, node availability, the shared token, and chain ID. |
| Backend tests fail on database access | Create the isolated test database and grants; do not switch tests to operational data. |

## Documentation

| Document | Focus |
| --- | --- |
| [Architecture](docs/architecture.md) | Architecture notes |
| [Backend setup](docs/backend-setup.md) | Database, API, and authentication runbook |
| [AI engine](ai_engine/README.md) | Vision pipeline, configuration, streaming, and evidence |
| [Backend security](docs/backend-security.md) | Security design notes |
| [Evidence integrity](docs/blockchain-integrity.md) | Hashing, signatures, custody, and ledger anchoring |
| [On-chain/off-chain matrix](docs/onchain-offchain-matrix.md) | Data placement and integrity responsibilities |
| [Threat model](docs/threat-model.md) | Security assumptions and threats |
| [Stabilization report](docs/IBVAP-STABILIZATION-2026-09-11.md) | Startup checks and known limitations at that revision |
| [Regression report](docs/IBVAP-PHASE5-FINAL-REGRESSION-2026-09-14.md) | Recorded validation results and blocked checks |
| [UI screenshots](frontend/docs/screenshots) | Captured interface examples |

Some documents describe earlier implementation phases. Check component scripts, configuration loaders, and routes when a historical guide differs from the current code.

## Contributing

1. Create a branch for a focused change.
2. Keep inference in the AI engine and application/alert authority in the backend.
3. Add a migration for schema changes and update environment examples for new settings.
4. Run the relevant checks above and document any prerequisites or unverified behavior.
5. Use a clear commit message describing the change.

Keep credentials, private keys, model weights, local environments, generated builds, and captured media out of commits. Retain provenance for model assets and use authorized footage for validation.

## License

This checkout does not contain a project-level `LICENSE` file. Dependency and model assets have their own terms; see the manifests and [model provenance notes](ai_engine/models/weights/README.md). Establish the project's license before distributing it under an assumed open-source license.
