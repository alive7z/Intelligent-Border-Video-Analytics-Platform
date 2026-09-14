# IBVAP historical audit — 13 September 2026

Scope: one direct controlled pipeline check plus a historical audit of the six
requested feature areas — incident lifecycle, snapshot selection, strict ANPR
attachment, clip removal, retention, and detail views — with the **evidence
boundary** called out clearly. This report describes the state of the working
tree and the live local environment (MySQL, backend, AI engine, frontend) on
13 September 2026. It is a verification report, not a production/live-camera
sign-off.

---

## 1. Direct controlled pipeline check

All checks run read-only against the running local stack (`db:ibvap @3306`,
`backend @5001`, `ai_engine @8001`, `frontend @5173`).

| Check | Command / target | Result |
| --- | --- | --- |
| Backend lint | `npm run lint` (eslint src tests, `--max-warnings=0`) | **PASS** (exit 0) |
| Frontend unit/component tests | `node --test src/__tests__/*.test.mjs` | **PASS — 32/32** |
| AI engine regressions | `python -m pytest tests/ -q` | **PASS — 399 passed**, 6 deprecation warnings only |
| Service health | `GET /api/health`, `/health`, `/` on 5001/8001/5173 | 200 / 200 / 200 |
| Prerequisite readiness | `bash scripts/check-readiness.sh` | **PASS with one DEGRADED item** (see below) |
| Backend DB-backed regressions | `npm test` (needs isolated MySQL `*_test`) | **BLOCKED — no test database and no DDL grants exist** for `ibvap_app`; the documented guardrail (`prepare-test.js` refuses a non-test DB) was respected. No test schema was created, and the operational `ibvap` schema was not modified. |

Readiness result (only deviation): the dedicated plate detector
(`license_plate_detector.pt`) is absent, so ANPR runs in **DEGRADED heuristic
plate-localization mode** with a structural localizer. YOLO11n and YuNet
weights are present. Weight presence is not inference or accuracy verification.

Frontend build is up to date (`frontend/dist`, built 13 Sep 21:42). No lint
script exists for the frontend.

### Direct boundary cross-check (live DB ↔ disk)

The check above enumerated every `evidence` row in MySQL against the files on
disk under `storage/` and compared assertion-linked evidence. Findings are in
§4.

---

## 2. Historical audit — requested feature areas

### 2.1 Incident lifecycle

- Node `alertManager.service.js` is the sole alert authority: qualification →
  dedup → create/escalate → audit → Socket.IO. Statuses NEW / ACTIVE /
  ACKNOWLEDGED / INVESTIGATING / RESOLVED / FALSE_POSITIVE plus
  `is_protected`, escalation, and soft delete.
- Persistent incident rows via migration `028` add `events.incident_key`
  (camera/session/track scoped, unique). The alert manager builds incident
  keys and re-opens/dedupes unresolved incidents by key.
- Incident package: `GET /api/alerts/:alertCode/package` assembles bounded
  camera/session/track event history (anchored on the alert's event, capped at
  500), real alert lifecycle/audit timestamps, and linked evidence; it is
  explicitly read-only and truncation-aware (`notice` states persisted records
  only, nothing reconstructed).
- Live state: 7 alerts (1 ACTIVE/HIGH, 6 NEW/MEDIUM), all unresolved; 959
  alert audit rows across 11 action types (ALERT_CREATED 535, ALERT_ESCALATED
  189, ALERT_ACKNOWLEDGED 94, ALERT_DELETED 20, ALERT_SAVED 16, ALERT_RESOLVED
  28, ALERT_FALSE_POSITIVE 14, ALERT_INVESTIGATING 15, PROTECTED 31+4,
  ALERT_UNSAVED 13).

### 2.2 Snapshot selection

- `ai_engine/evidence/manager.py`: bounded ring buffer (pre/post seconds), at
  most 3 in-memory vehicle candidates per track ranked by sharpness, exposure,
  clipping, vehicle visibility, and plate-region visibility; exactly **one**
  best annotated JPEG per incident.
- `ai_engine/evidence/recorder.py`: deterministic UUID +
  atomic non-overwriting publish (`os.link`, keep-first) so retries cannot
  replace a selected winner while the DB still carries its original checksum.
  File bytes precede the Node metadata insert (size + SHA-256 returned by
  Python, then stored by the repository).

### 2.3 Strict ANPR attachment

- `anprObservation.service.js`: after restricted-zone entry, a confirmed plate
  **attaches to the existing incident row** (via `incident_key`) instead of
  minting a second `PLATE_DETECTED` event; adds `ANPR_CONFIRMED` timeline
  entries, upserts the `plates` row, and attaches `vehicle_plate` + plate
  snapshot evidence to the alert (migrations `024`, `027`).
- Not verified end-to-end on this stack: the `plates` table is empty and there
  are no `VEHICLE` evidence rows in MySQL, so the strict-attachment branch has
  not yet been exercised by a fully qualified read here. Plate validation,
  consensus, and quality-gate logic is covered by the 399 AI-engine tests.

### 2.4 Clip removal

- `INCIDENT_CLIP` is deliberately suppressed across the app: excluded from the
  incident package query (`WHERE evidence_type <> 'INCIDENT_CLIP'`),
  `findByEventId`/`findByAlertId`, retention stats, `EvidenceGallery`
  (also drops `video/*`), `RelatedEvidence`, and the REST/socket adapters.
  Legacy `.mp4` files are handled only as `LEGACY_MEDIA` by operational
  cleanup.
- Live residue: 8 `INCIDENT_CLIP` rows + 8 `.mp4` files remain, all captured
  13 Sep ~15:10–15:12 (before clip suppression landed later that day) and
  linked to live alerts 3439–3445. They are invisible to the UI/package but
  persist because their parent alerts are unresolved (retention does not purge
  live-alert evidence). See §4.3.

### 2.5 Retention

- `retention.service.js`: per-severity age expiry, resolved-alert expiry
  (`resolvedAlertHours`), normal-event count cap, and orphan-evidence purge
  with **file-before-row** ordering; protected rows and rows backing live
  alerts always survive. Admin UI (`RetentionSettings.jsx`) exposes settings,
  "Run Cleanup Now", and phrase-confirmed "Clean All Operational Data".
- The orphan purge deletes the file first; a failed file delete keeps the row
  for a later retry, and a missing file is tolerated (row is still removed).

### 2.6 Detail views

- `AlertDetails.jsx`: incident package (30s auto-refresh), timeline
  (`IncidentTimeline`), risk reasons, operator actions, related
  camera/evidence/events. `EventDetails.jsx`: event/relations/alert/timeline/
  risk/object info, protect/unprotect. Intelligence detail tables for
  plates/vehicles/faces and `CameraDetails.jsx` runtime status.
- Frontend tests assert the gallery never renders `INCIDENT_CLIP` / `video/*`
  and never invents ids, boxes, zones, or clip durations.

---

## 3. The evidence boundary (called out clearly)

Definition enforced across the stack: **MySQL stores metadata only; disk under
`storage/` stores binaries only.** The two sides are joined by a relative
`file_path` on each evidence row, resolved against `REPO_ROOT` and confined so
`..`-traversal escapes are refused.

| Side | Holds | Written by | Removed by |
| --- | --- | --- | --- |
| MySQL `evidence` rows | evidence_code, file_path, mime_type, file_size_bytes, checksum, captured_at, FK to event/alert/camera | Node `evidence.repository.create` (idempotent, incident-scoped dedup) | Retention hard-deletes the row **only after** its file is gone; missing file tolerated |
| Disk `storage/{snapshots,plates,vehicles,faces}` | JPEG/MP4 binaries, never in DB | Python `recorder.capture_snapshot/capture_face_crop` (atomic keep-first, returns size+checksum) | Retention rec:moves the file **before** the row; row-less files are invisible to retention |
| API/package | Read-only join of rows; **never reconstructs absent images**, never infers identity; `INCIDENT_CLIP` and `video/*` excluded | — | — |

Ordering guarantees at the boundary:

1. **Write:** Python renders + fsyncs the complete file via a temp file +
   hard-link publish, then ships `storageReference`, `fileSizeBytes`,
   `checksum` to Node; Node inserts the row. The DB can therefore reference a
   real, checksummed file produced by the snapshot-selection winner.
2. **Read:** the incident package joins rows only; absent files simply do not
   render. No thumbnail/client-side reconstruction is attempted.
3. **Remove:** retention deletes the file first; the row is deleted only when
   the file delete succeeded (or the file was already missing), so a failed
   disk delete leaves an honest metadata row for retry rather than
   file-without-row drift from the deletion side.

The one-sided gap in this design: nothing purges **row-less files** (perfectly
fine files on disk with no metadata row), because both retention and
operational cleanup only ever walk rows/files that exist in the DB.

## 4. Boundary findings from the controlled check

### 4.1 Metadata-only rows — 6 rows with no file on disk

Six `evidence` rows (all with `file_size_bytes` and `checksum` NULL, and no
event/alert/camera links) reference files that do not exist under `storage/`.
They were written 13 Sep 16:11–16:13 by a partial path that inserted metadata
without the file-backing round trip (a write whose Python half did not land, or
was inserted by a manual/other harness):

| evidence id | evidence_type | evidence_code | file_path |
| --- | --- | --- | --- |
| 2144 | PLATE | 8b01c6c3-b7c6-4af0-9ce4-75b80e781758 | storage/plates/8b01c6c3-...jpg |
| 2145 | SNAPSHOT | 81b13043-be5e-4ebf-854a-e7f77430e868 | storage/snapshots/81b13043-...jpg |
| 2153 | PLATE | 02f351c6-c061-4358-a91b-035f048d2018 | storage/plates/02f351c6-...jpg |
| 2154 | SNAPSHOT | a2116d9d-8955-4263-9f3e-e6ea2c27ba14 | storage/snapshots/a2116d9d-...jpg |
| 2173 | PLATE | 353d6ca3-3e29-4f10-a6ae-43744431e33c | storage/plates/353d6ca3-...jpg |
| 2174 | SNAPSHOT | 5e3e2d4e-91e3-497a-85b4-5723a1e85baf | storage/snapshots/5e3e2d4e-...jpg |

Impact: these rows satisfy the orphan predicate (no surviving parent) and are
eligible for the orphan purge once they exceed `evidenceHours`; because their
files are already absent, the purge will tolerate the missing file and delete
rows only. Until then they are dead metadata referenced by nobody and served by
nothing.

### 4.2 Row-less files — 2 files on disk with no metadata row

| file | size | styled for |
| --- | --- | --- |
| storage/plates/976e760c-c7f7-5ee7-9b61-f8e4bd756fa2.jpg | 21,383 B | PLATE |
| storage/vehicles/e14f713e-689f-5cea-8067-2d394210e802.jpg | 121,564 B | VEHICLE |

No `evidence` row (or `plates`/`vehicles` table entry) references either file.
Because retention only walks rows, these are **permanent orphans** under the
current design; operational "Clean All Data" handles them only as legacy media.

### 4.3 Legacy clip residue — 8 INCIDENT_CLIP rows + 8 MP4s

Consistent DB↔disk (each of the 8 rows has its MP4), but the type is the
suppressed `INCIDENT_CLIP`: ids 2126, 2128, 2130, 2132, 2134, 2136, 2138, 2140
(≈3.5–8.7 MB each, linked to live alerts 3439–3445). They predate clip removal,
are excluded from package/repos/UI/retention stats, and persist because their
parent alerts are unresolved.

## 5. Blocked / not verifiable in this pass

- Backend DB-backed regression suite: needs an isolated `*_test` MySQL schema;
  no DDL grant exists for `ibvap_app` and no root/dev credentials were
  available, so the documented guardrail was respected rather than bypassed.
- Live RTSP cameras: CAM-01/CAM-02 source URLs are still pending; none
  connected. The 13 Sep 15:10–16:13 events/clips on the stack came from a
  local file/synthetic feed, not a live border camera.
- ANPR strict-attachment and plate-confirmation path has not produced a
  `plates` row on this stack yet; validated by unit/integration tests only.
- Row-less-file purging and the 6 metadata-only rows are boundary gaps not yet
  covered by cleanup logic (see §4.1/§4.2).

## 6. Conclusion

The six requested feature areas are implemented and pass every available
automated gate (backend lint, 32/32 frontend, 399 AI-engine, service health).
The controlled pipeline check surfaced three precise evidence-boundary
deviations in the live store — **6 metadata-only rows** (dead rows, purgeable),
**2 row-less files** (permanent orphans under current logic), and **8 legacy
INCIDENT_CLIP rows+files** (suppressed but uncollected while their alerts are
live) — plus the known DEGRADED-heuristic ANPR mode from the missing dedicated
plate weights. Nothing in the store is fabricated by the UI or package layer;
the boundary's read side holds. No operational data was deleted or modified
during this audit.