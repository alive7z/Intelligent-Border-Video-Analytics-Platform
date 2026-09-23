# IBVAP Docker deployment

This is the authoritative deployment path for the current IBVAP application. It packages the existing React frontend, Node API, Python AI engine, MySQL migrations, evidence storage, and optional permissioned ledger/monitoring components without changing application contracts or surveillance logic.

## Architecture

```text
Browser ── HTTP/HTTPS ── nginx-gateway
                          ├── frontend:80 (static React SPA)
                          ├── backend:5001 (/api and /socket.io)
                          │    ├── mysql:3306
                          │    ├── redis:6379 (optional)
                          │    └── ledger-bop:8541 (optional)
                          └── browser preview remains backend-proxied

backend:5001 ⇄ ai-engine:8001 ── RTSP/CCTV LAN
                     └────────── shared evidence bind mount
```

Only the Nginx gateway publishes application ports. Backend, AI, MySQL, Redis, and ledger nodes remain private. Prometheus and Grafana are optional and bind to loopback by default.

## Host requirements

- Linux edge host for the supported production path; Docker Engine 24+ with Docker Compose v2.
- macOS Docker Desktop is supported for local/demo infrastructure, subject to the MPS limitation below.
- At least 4 CPU cores and 8 GB RAM for a small CPU-only demonstration. Multiple live streams and full-rate inference generally need 8+ cores, 16+ GB RAM, and a supported accelerator sized through field testing.
- Adequate persistent disk for MySQL, evidence retention, model files, logs, and backups.
- Network routes and firewall rules that let the AI runtime reach configured RTSP cameras.

Container resource requirements depend strongly on resolution, stream count, sampling rate, and inference device. Validate capacity using the intended cameras; these baseline numbers are not a field sizing guarantee.

## Deployment files

- `docker-compose.yml`: core stack and optional profiles.
- `deploy.env.example`: deployment environment template.
- `frontend/Dockerfile`: Vite production build and static Nginx runtime.
- `backend/Dockerfile`: production Node runtime and migration image.
- `ai_engine/Dockerfile`: Python 3.11 runtime with the frozen dependencies.
- `infra/nginx/nginx.conf`: local/demo HTTP gateway.
- `infra/nginx/nginx.https.conf`: TLS 1.2+ production gateway.
- `scripts/deploy/`: environment/model checks, deploy, health, and backup helpers.

## Environment and secrets

Create the ignored deployment file:

```sh
cp deploy.env.example .env
```

Replace every placeholder. Generate independent random values; for example, `openssl rand -hex 32` can generate one secret at a time. Never reuse the database root password, application database password, JWT secret, AI service token, preview token, ledger token, or Grafana password. Do not commit `.env`, certificates, private keys, model weights, camera credentials, or backups.

The current application reads environment variables, not Docker secret files. Therefore `.env` should live outside source control with restrictive host permissions. PEM signing keys can be supplied through the existing environment variables, but a production secret manager that renders the protected runtime environment is preferred.

Validate configuration before building:

```sh
./scripts/deploy/check-env.sh .env
docker compose --env-file .env config --quiet
```

Production keeps `DEMO_MODE=false`. Set `ENABLE_HSTS=true` only with the HTTPS configuration. Enabling evidence encryption or MFA requires the existing 64-hex-character `EVIDENCE_MASTER_KEY` contract.

## Offline AI models

Model downloads are intentionally disabled. Place these files in `AI_MODEL_DIR` (default `./ai_engine/models/weights`):

```text
yolo11n.pt
license_plate_detector.pt
face_detection_yunet_2023mar.onnx
```

Set `EASYOCR_MODEL_DIR` to an absolute host directory containing:

```text
craft_mlt_25k.pth
english_g2.pth
```

The detector directory is mounted read-only at `/models`; the EasyOCR directory is mounted read-only at `/home/ibvap/.EasyOCR/model`. Weights are neither copied into images nor committed. Check them with:

```sh
./scripts/deploy/check-models.sh .env
```

The AI entrypoint refuses to start when any required file is absent/unreadable or when evidence storage is unwritable. It then reuses `ai_engine/check_readiness.py` before launching the repository's real `python main.py --serve --all-cameras` path.

## First deployment

1. Copy and complete `.env`.
2. Place all model and EasyOCR files as described above.
3. Ensure `EVIDENCE_HOST_PATH` is backed up and writable by container uid 10001. On native Linux, use a dedicated group/ACL or assign uid 10001 ownership.
4. Validate, build, start MySQL, run migrations, and start the core stack.

The helper performs those steps and stops if migration or health validation fails:

```sh
./scripts/deploy/deploy.sh .env
```

The equivalent transparent sequence is:

```sh
./scripts/deploy/check-env.sh .env
./scripts/deploy/check-models.sh .env
docker compose --env-file .env config --quiet
docker compose --env-file .env build
docker compose --env-file .env up -d --wait mysql
docker compose --env-file .env run --rm migrate
docker compose --env-file .env up -d --wait
./scripts/deploy/health-check.sh .env
```

The one-shot `migrate` service runs `backend/src/db/migrate.js` against MySQL. It applies the existing numbered migrations and records them in `schema_migrations`; it does not seed demo data. Migration failure returns nonzero and stops the helper.

## Routine operation

```sh
docker compose --env-file .env ps
docker compose --env-file .env logs -f
docker compose --env-file .env logs -f backend
docker compose --env-file .env logs -f ai-engine
docker compose --env-file .env restart backend
docker compose --env-file .env down
```

Never use `docker compose down -v` for normal stops or updates. It deletes named persistent volumes.

## Demo deployment and explicit seeding

For a local SIH demo, use the HTTP Nginx file, set `PUBLIC_ORIGIN`, set `DEMO_MODE=true`, and use only explicitly configured LAN/test cameras. Then deploy normally.

Demo fixtures are never seeded automatically. The existing seed guard rejects production mode, so an operator must make the nonproduction intent explicit:

```sh
docker compose --env-file .env run --rm \
  -e NODE_ENV=development -e ALLOW_DEMO_SEED=true \
  backend npm run db:seed
```

Login-enabled demo users require the repository's existing `db:seed-users` variables. Supply them securely at invocation time; this guide does not define or print passwords.

## Production HTTPS

Place `fullchain.pem` and `privkey.pem` in the ignored `TLS_CERT_DIR`, readable by Docker. Update `.env` to use:

```text
NGINX_CONFIG_FILE=./infra/nginx/nginx.https.conf
PUBLIC_ORIGIN=https://your-deployment-host
HEALTHCHECK_URL=https://your-deployment-host
ENABLE_HSTS=true
```

Then recreate the gateway. Port 80 redirects to 443; TLS 1.2 and 1.3 are enabled. Certificates are runtime-mounted and never baked into an image. The same `/socket.io/` upgrade and `/api/preview/` streaming paths work through TLS.

## Redis, ledger, and monitoring profiles

Redis is optional because the application already degrades to database/AI runtime state when it is disabled. To use it, set `COMPOSE_PROFILES=cache` and `REDIS_ENABLED=true`, or add `cache` to a comma-separated profile list before deployment.

The ledger is an existing permissioned, MAC-authenticated integrity-anchor prototype—not distributed production-grade consensus. Evidence stays off-chain; only existing digests, metadata, and roots are anchored. Enable it with `COMPOSE_PROFILES=ledger`, `BLOCKCHAIN_ENABLED=true`, and a strong `LEDGER_NODE_TOKEN`. The three private nodes keep independent volumes and chain id 51201. The backend anchors to `ledger-bop`.

Monitoring is optional:

```sh
docker compose --env-file .env --profile monitoring up -d
```

Set `GRAFANA_ADMIN_PASSWORD` first. Prometheus and Grafana publish only on `127.0.0.1` by default; use an authenticated reverse proxy or SSH tunnel for remote access. Grafana is provisioned with Prometheus. Current IBVAP health endpoints return JSON rather than Prometheus exposition data, so Prometheus truthfully self-monitors only; application metrics are not fabricated.

## RTSP and edge networking

Camera URLs and credentials remain in the existing protected camera configuration. They are not hardcoded into Compose or exposed to the browser. The browser preview remains `/api/preview/...` through the backend.

Test bridge networking first from inside the AI container. A cloud host cannot normally reach a private `192.168.x.x` camera LAN. Check routing, camera ACLs, VLANs, DNS, and RTSP/TCP reachability on the edge host.

For a Linux camera network that requires host networking, use the optional override:

```sh
AI_NODE_API_URL=http://127.0.0.1/api \
docker compose --env-file .env \
  -f docker-compose.yml -f infra/compose/ai-host-network.yml up -d
```

Host networking reduces isolation and is Linux-specific. When the gateway is HTTPS, set `AI_NODE_API_URL` to its trusted HTTPS origin. The backend reaches the host-network AI service through `host.docker.internal:8001`.

## macOS and Apple MPS

Docker Desktop runs Linux containers and does not normally expose Apple's MPS acceleration to PyTorch inside the AI container. For a Mac demo, run MySQL/backend/frontend/gateway in Docker and run AI natively on macOS:

```sh
docker compose --env-file .env up -d --wait mysql
docker compose --env-file .env run --rm migrate
docker compose --env-file .env up -d backend frontend nginx-gateway
```

Set backend `AI_INTERNAL_URL=http://host.docker.internal:8001`. Configure the native AI process with `NODE_API_URL=http://localhost/api` and the same `AI_SERVICE_TOKEN`, then run the existing native entrypoint. This is a demo option; the fully containerized Linux deployment remains the production/edge path.

## Health and functional verification

Automated container checks use the real endpoints: frontend HTTP, backend `/api/health`, AI `/health`, `mysqladmin ping`, Redis `redis-cli ping`, ledger `POST /health`, and gateway HTTP. Run:

```sh
./scripts/deploy/health-check.sh .env
```

Container health is necessary but not a functional acceptance test. With authorized test accounts and an accessible test camera, manually verify:

- normal login, each role, MFA challenge, logout/session revocation, and demo login disabled in production;
- dashboard, map, analytics, intelligence, admin, audit logs, and API error behavior;
- Socket.IO connection and realtime events;
- camera list/source configuration and backend-proxied preview without any RTSP URL in browser tools;
- RTSP ingest, YOLO detection, ByteTrack continuity, dedicated ANPR/OCR, and YuNet face detection only;
- event/risk/alert creation and acknowledgement;
- evidence files, hashes, custody records, integrity verification, and optional ledger anchoring.

Do not claim RTSP, inference accuracy, GPU behavior, MFA, or browser workflows from a container healthcheck alone.

## Persistence test

Perform this only on a disposable acceptance deployment:

1. Create a test user/camera/event and capture representative evidence.
2. Record MySQL counts, evidence paths/hashes, and ledger height if enabled.
3. Run `docker compose --env-file .env down` without `-v`.
4. Run the normal start sequence again.
5. Confirm users, camera configuration, events, evidence database records/files, and each enabled ledger node's height remain.

MySQL uses `mysql_data`; Redis, each ledger node, Prometheus, and Grafana have separate named volumes. Evidence and security-event NDJSON use `EVIDENCE_HOST_PATH`.

## Backups

Create a host-side MySQL dump and evidence archive with:

```sh
./scripts/deploy/backup.sh .env /secure/off-host/staging-directory
```

Copy the timestamped output to protected off-host storage and test restoration. If ledger is operationally enabled, snapshot each of `ledger_bop_data`, `ledger_sector_data`, and `ledger_command_data` separately while writes are quiesced; never merge the node stores. Prometheus/Grafana volumes may also be snapshotted if their history/configuration matters. Container images are not backups, and backup archives must not remain only inside containers.

## Safe updates

```sh
git pull --ff-only
docker compose --env-file .env build
docker compose --env-file .env up -d --wait mysql
docker compose --env-file .env run --rm migrate
docker compose --env-file .env up -d --wait
./scripts/deploy/health-check.sh .env
```

Back up first, review release changes, and retain volumes. Rollback planning must account for database migrations; rebuilding an older image does not reverse schema changes.

## Troubleshooting

- `check-env.sh` fails: replace placeholders, lengthen independent secrets, and configure conditional ledger/Grafana/encryption values.
- AI exits immediately: inspect `docker compose logs ai-engine`; verify all five offline model files, read permissions, and evidence directory permissions.
- Backend is unhealthy: confirm MySQL is healthy and migrations completed; inspect backend logs without printing secrets.
- Camera is offline: test RTSP reachability from the AI network namespace and camera ACLs. Do not expose the RTSP URL in frontend configuration.
- SPA refresh returns 404: ensure traffic reaches `nginx-gateway`, which forwards to the frontend runtime with `try_files ... /index.html`.
- Preview stalls: verify AI health and `/api/preview/`; gateway buffering is disabled for this streaming route.
- Socket.IO fails: verify the public origin, TLS trust, reverse-proxy upgrade headers, and browser network trace.
- Ledger fails: ensure the profile is enabled, every node is healthy, the shared token matches, and separate volumes are writable.

## Known limitations

- External model assets and TLS certificates must be provisioned by the operator.
- RTSP/LAN routing is site-specific and cannot be proven from a generic build host.
- macOS containerized AI normally cannot use Apple MPS; native AI is the documented demo workaround.
- The ledger is a permissioned integrity-anchor prototype and should not be described as tamper-proof or production-certified.
- Prometheus currently has no application-format metrics endpoint to scrape.
- Browser, camera, sustained-load, inference-quality, and disaster-recovery acceptance require the target environment and authorized credentials.
