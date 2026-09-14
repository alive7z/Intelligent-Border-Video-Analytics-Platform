const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ibvap-evidence-test-"));
process.env.EVIDENCE_BASE_PATH = evidenceRoot;
const app = require("../src/app");
const env = require("../src/config/env");
const { getPool, closeDatabasePool } = require("../src/config/database");
const cameras = require("../src/repositories/camera.repository");
const events = require("../src/repositories/event.repository");
const evidence = require("../src/repositories/evidence.repository");
const { resolveStorageReference } = require("../src/services/evidence.service");
const { toSafeCamera } = require("../src/services/camera.service");
const { getRelatedEvents, relationFor } = require("../src/services/eventCorrelation.service");
let a, b, unrelated;
const session = crypto.randomUUID();
const now = new Date();
const occurredAt = now.toISOString().slice(0, 19).replace("T", " ");
const createEvent = (camera, overrides = {}) => events.create({
  eventCode: crypto.randomUUID(), cameraId: camera.id, eventType: "SUSPICIOUS_ACTIVITY",
  objectType: "PERSON", trackId: 17, severity: "HIGH", riskScore: 70, confidence: null,
  context: { observationId: crypto.randomUUID(), streamSessionId: session, reasons: [{ code: "FENCE_CROSSING" }] },
  occurredAt, ...overrides,
});

before(async () => {
  assert.equal(env.NODE_ENV, "test");
  assert.match(env.DB.NAME, /(^|_)test($|_)/i);
  const createCamera = () => cameras.create({ cameraCode: `HARD-${crypto.randomUUID().slice(0, 8)}`, name: "Isolated hardening fixture", sourceType: "IP_CAMERA", streamProtocol: "RTSP", streamUrl: "rtsp://user:secret@example.invalid/live", enabled: true });
  a = await createCamera();
  b = await createCamera();
  unrelated = await createCamera();
  a = await cameras.update(a.id, { geographicConfig: { latitude: 28.6, longitude: 77.2, neighborCameraCodes: [b.camera_code] } });
});

after(async () => {
  for (const camera of [a, b, unrelated].filter(Boolean)) {
    await getPool().execute("DELETE FROM evidence WHERE camera_id = ?", [camera.id]);
    await getPool().execute("DELETE FROM alerts WHERE camera_id = ?", [camera.id]);
    await getPool().execute("DELETE FROM events WHERE camera_id = ?", [camera.id]);
    await cameras.remove(camera.id);
  }
  await closeDatabasePool();
  fs.rmSync(evidenceRoot, { recursive: true, force: true });
});

test("configured map geography survives persistence without exposing stream credentials", () => {
  const safe = toSafeCamera(a);
  assert.equal(safe.latitude, 28.6);
  assert.equal(safe.longitude, 77.2);
  assert.deepEqual(safe.neighborCameraCodes, [b.camera_code]);
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.equal(toSafeCamera(b).latitude, null);
});

test("all-camera discovery requires the AI token and preserves per-camera configuration", async () => {
  const url = "/api/internal/ai/cameras/source-configs";
  assert.equal((await request(app).get(url)).status, 401);
  const res = await request(app).get(url).set("X-IBVAP-AI-Key", env.AI_SERVICE_TOKEN);
  assert.equal(res.status, 200);
  const config = res.body.data.cameras.find((item) => item.cameraCode === a.camera_code);
  assert.equal(config.sourceType, "RTSP");
  assert.equal(config.streamUrl, "rtsp://user:secret@example.invalid/live");
});

test("same track and session on separate cameras create separate initial observations", async () => {
  const data = { eventType: "PERSON_DETECTED", context: { streamSessionId: session }, riskScore: null, severity: "INFO" };
  const results = await Promise.all([createEvent(a, data), createEvent(a, data), createEvent(b, data)]);
  assert.equal(results[0].event_code, results[1].event_code);
  assert.notEqual(results[0].event_code, results[2].event_code);
  assert.equal(results.filter((row) => row.wasCreated !== false).length, 2);
});

test("concurrent face evidence writes enforce three crops per track event", async () => {
  const event = await createEvent(a, { eventType: "FACE_DETECTED" });
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => evidence.create({
    evidenceCode: crypto.randomUUID(), eventId: event.id, alertId: null, cameraId: a.id,
    evidenceType: "FACE", filePath: "storage/faces/fixture.jpg", capturedAt: occurredAt,
  })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  results.filter((r) => r.status === "rejected").forEach((r) => assert.equal(r.reason.statusCode, 409));
});

test("storage traversal, absolute references and symlink escapes are rejected", () => {
  assert.equal(resolveStorageReference("storage/faces/example.jpg"), path.join(evidenceRoot, "faces/example.jpg"));
  for (const reference of ["storage/../../etc/passwd", "/etc/passwd", "storage/", "storage/..\\secret"]) {
    assert.throws(() => resolveStorageReference(reference));
  }
  fs.symlinkSync(os.tmpdir(), path.join(evidenceRoot, "outside"));
  assert.throws(() => resolveStorageReference("storage/outside/other-evidence.jpg"));
});

test("event correlations include configured neighbors only and enforce operator assignments", async () => {
  const source = await createEvent(a);
  const neighbor = await createEvent(b);
  const other = await createEvent(unrelated);
  const result = await getRelatedEvents(source.event_code, { role: "ADMINISTRATOR" });
  assert.ok(result.items.some((item) => item.event_code === neighbor.event_code));
  assert.equal(result.items.some((item) => item.event_code === other.event_code), false);
  assert.equal(result.identityVerified, false);
  assert.ok(result.items.every((item) => item.correlation.reason));
  await assert.rejects(getRelatedEvents(source.event_code, { role: "SECURITY_OPERATOR", userId: 999999999 }), { statusCode: 403 });
});

test("ordinary detections, old observations and matching numeric track IDs do not establish cross-camera identity", () => {
  const base = { event_code: "one", camera_code: "A", event_type: "PERSON_DETECTED", track_id: 17, occurred_at: now, context: { streamSessionId: session } };
  assert.equal(relationFor(base, { ...base, event_code: "two", camera_code: "B" }, ["B"]), null);
  assert.equal(relationFor(base, { ...base, event_code: "two", occurred_at: new Date(now.getTime() + 121000) }), null);
  assert.equal(relationFor(base, { ...base, event_code: "two", context: { streamSessionId: "different" } }), null);
});

test("incident package binds evidence and persisted timeline to the same camera/session/track", async () => {
  const alertRepository = require("../src/repositories/alert.repository");
  const { getIncidentPackage } = require("../src/services/incidentPackage.service");
  const anchor = await createEvent(a, { trackId: 55 });
  const code = crypto.randomUUID();
  const alert = await alertRepository.create({ alertCode: code, eventId: anchor.id, cameraId: a.id,
    alertType: "SUSPICIOUS_ACTIVITY", severity: "HIGH", riskScore: 70,
    reason: { reasons: ["FENCE_CROSSING"] }, status: "NEW" });
  const face = await createEvent(a, { trackId: 55, eventType: "FACE_DETECTED" });
  const otherSession = await createEvent(a, { trackId: 55, context: { streamSessionId: "different" } });
  const otherCamera = await createEvent(b, { trackId: 55 });
  const media = await evidence.create({ evidenceCode: crypto.randomUUID(), eventId: face.id,
    alertId: null, cameraId: a.id, evidenceType: "FACE", filePath: "storage/faces/fixture.jpg", capturedAt: occurredAt });
  await evidence.create({ evidenceCode: crypto.randomUUID(), eventId: anchor.id,
    alertId: alert.id, cameraId: a.id, evidenceType: "SNAPSHOT", filePath: "storage/snapshots/fixture.jpg", capturedAt: occurredAt });
  const result = await getIncidentPackage(code, { role: "ADMINISTRATOR" });
  assert.equal(result.incidentId, code);
  assert.equal(result.scope, "CAMERA_SESSION_TRACK");
  assert.ok(result.evidence.some((item) => item.evidence_code === media.evidence_code));
  assert.ok(result.timeline.some((item) => item.eventCode === anchor.event_code));
  assert.ok(result.timeline.some((item) => item.eventCode === face.event_code));
  assert.ok(!result.events.some((item) => [otherSession.event_code, otherCamera.event_code].includes(item.event_code)));
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result.evidence).includes("file_path"), false);
  await assert.rejects(getIncidentPackage(code, { role: "SECURITY_OPERATOR", userId: 999999999 }), { statusCode: 403 });
});
