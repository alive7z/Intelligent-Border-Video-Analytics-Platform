// Saved Alerts lifecycle, RBAC, idempotency, and retention preservation.
// Requires NODE_ENV=test and a database whose name contains "test" (see
// src/db/prepare-test.js and npm run db:prepare-test).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../src/app");
const { getPool, closeDatabasePool } = require("../src/config/database");
const { hashPassword } = require("../src/utils/password");
const retentionService = require("../src/services/retention.service");
const alertService = require("../src/services/alert.service");
const alertRepository = require("../src/repositories/alert.repository");

let pool;
let testCameraId;
let createdEventIds = [];
let createdAlertIds = [];
let createdEvidenceIds = [];
let createdUserIds = [];
let originalSettings = null;

const TEST_CAMERA = "CAM-SAVED-TEST";

const insertCamera = async (code) => {
  const [result] = await pool.execute(
    `INSERT INTO cameras
       (camera_code, name, source_type, stream_status, ai_status, enabled)
     VALUES (?, ?, 'VIDEO_FILE', 'ONLINE', 'ACTIVE', 1)`,
    [code, "Saved Alerts Test " + code]
  );
  return result.insertId;
};

const insertEvent = async ({ trackId = 1, occurredAt = "2020-01-01 00:00:00", protected: isProtected = 0, protectionSource = null }) => {
  const [result] = await pool.execute(
    `INSERT INTO events
       (event_code, camera_id, event_type, object_type, track_id, confidence, risk_score,
        severity, status, context_json, occurred_at, is_protected, protection_source)
     VALUES (?, ?, 'SUSPICIOUS_ACTIVITY', 'PERSON', ?, 0.9, 70.0, 'HIGH', 'NEW', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      testCameraId,
      String(trackId),
      JSON.stringify({ source: "SAVED_TEST" }),
      occurredAt,
      isProtected,
      protectionSource,
    ]
  );
  createdEventIds.push(result.insertId);
  return result.insertId;
};

const insertAlert = async ({
  eventId,
  severity = "HIGH",
  status = "NEW",
  riskScore = 70,
  createdAt = "2020-01-01 00:00:00",
  updatedAt = "2020-01-01 00:00:00",
  protected: isProtected = 0,
  protectionSource = null,
  saved = 0,
}) => {
  const [result] = await pool.execute(
    `INSERT INTO alerts
       (alert_code, event_id, camera_id, alert_type, severity, risk_score, status,
        reason_json, is_protected, protection_source, is_saved, created_at, updated_at)
     VALUES (?, ?, ?, 'SUSPICIOUS_ACTIVITY', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      eventId,
      testCameraId,
      severity,
      riskScore,
      status,
      JSON.stringify({ source: "SAVED_TEST" }),
      isProtected,
      protectionSource,
      saved,
      createdAt,
      updatedAt,
    ]
  );
  createdAlertIds.push(result.insertId);
  return result.insertId;
};

const insertEvidence = async ({ eventId = null, alertId = null, type = "SNAPSHOT", capturedAt = "2020-01-01 00:00:00" }) => {
  const [result] = await pool.execute(
    `INSERT INTO evidence
       (evidence_code, event_id, alert_id, camera_id, evidence_type, file_path, mime_type, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), eventId, alertId, testCameraId, type, `storage/snapshots/${crypto.randomUUID()}.jpg`, "image/jpeg", capturedAt]
  );
  createdEvidenceIds.push(result.insertId);
  return result.insertId;
};

const insertUser = async (role) => {
  const email = `saved.${crypto.randomUUID().slice(0, 8)}@ibvap.local`;
  const [result] = await pool.execute(
    "INSERT INTO users (public_id, full_name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
    [crypto.randomUUID(), "Saved Tester", email, await hashPassword("Saved#Test#2026!"), role]
  );
  createdUserIds.push(result.insertId);
  return { id: result.insertId, email };
};

const actorFor = (userId) => ({ userId, ipAddress: "127.0.0.1" });

const auditCount = async (alertCode, action) => {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS c FROM audit_logs WHERE entity_type = 'alert' AND entity_id = ? AND action = ?",
    [alertCode, action]
  );
  return rows[0].c;
};

const alertCodeFor = async (alertId) => {
  const [rows] = await pool.execute("SELECT alert_code FROM alerts WHERE id = ?", [alertId]);
  return rows[0].alert_code;
};

before(async () => {
  pool = getPool();
  originalSettings = await require("../src/repositories/retention.repository").getSettings();
  await pool.execute("DELETE FROM evidence WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = ?)", [TEST_CAMERA]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = ?)", [TEST_CAMERA]).catch(() => {});
  await pool.execute("DELETE FROM events WHERE camera_id IN (SELECT id FROM cameras WHERE camera_code = ?)", [TEST_CAMERA]).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE camera_code = ?", [TEST_CAMERA]).catch(() => {});
  testCameraId = await insertCamera(TEST_CAMERA);
});

after(async () => {
  if (originalSettings) {
    await require("../src/repositories/retention.repository").updateSettings(originalSettings, null).catch(() => {});
  }
  for (const uid of createdUserIds) {
    await pool.execute("DELETE FROM audit_logs WHERE user_id = ?", [uid]).catch(() => {});
    await pool.execute("DELETE FROM users WHERE id = ?", [uid]).catch(() => {});
  }
  await pool.execute("DELETE FROM evidence WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM alerts WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM events WHERE camera_id = ?", [testCameraId]).catch(() => {});
  await pool.execute("DELETE FROM cameras WHERE id = ?", [testCameraId]).catch(() => {});
  await closeDatabasePool();
});

test("save is idempotent: single audit, single protection, original saved_by preserved", async () => {
  const ev = await insertEvent({ trackId: 2 });
  const al = await insertAlert({ eventId: ev });
  const code = await alertCodeFor(al);
  const user = await insertUser("SECURITY_OPERATOR");

  const saved1 = await alertService.saveAlert(code, actorFor(user.id));
  assert.strictEqual(saved1.is_saved, 1);
  assert.strictEqual(saved1.is_protected, 1);
  assert.strictEqual(saved1.protection_source, "SAVED_ALERT");
  assert.strictEqual(saved1.saved_by, user.id);

  const saved2 = await alertService.saveAlert(code, actorFor(user.id));
  assert.strictEqual(saved2.is_saved, 1);
  assert.strictEqual(saved2.saved_by, user.id, "re-save must keep the original saved_by");

  assert.strictEqual(await auditCount(code, "ALERT_SAVED"), 1, "re-save must not add a second audit");

  const [evRow] = await pool.execute("SELECT is_protected, protection_source FROM events WHERE id = ?", [ev]);
  assert.strictEqual(evRow[0].is_protected, 1, "saving an alert must protect its anchor event");
  assert.strictEqual(evRow[0].protection_source, "SAVED_ALERT");
});

test("unsave removes only SAVE-created protection (alert + event)", async () => {
  const ev = await insertEvent({ trackId: 3 });
  const al = await insertAlert({ eventId: ev });
  const code = await alertCodeFor(al);
  const user = await insertUser("SECURITY_OPERATOR");

  await alertService.saveAlert(code, actorFor(user.id));
  const unsaved = await alertService.unsaveAlert(code, actorFor(user.id));
  assert.strictEqual(unsaved.is_saved, 0);
  assert.strictEqual(unsaved.is_protected, 0, "SAVE-created alert protection must be removed on unsave");
  assert.strictEqual(unsaved.protection_source, null);

  const [evRow] = await pool.execute("SELECT is_protected, protection_source FROM events WHERE id = ?", [ev]);
  assert.strictEqual(evRow[0].is_protected, 0, "SAVE-created event protection must be removed on unsave");
  assert.strictEqual(evRow[0].protection_source, null);

  await alertService.unsaveAlert(code, actorFor(user.id));
  assert.strictEqual(await auditCount(code, "ALERT_UNSAVED"), 1, "re-unsave must not add a second audit");
});

test("unsave preserves pre-existing manual/legacy protection", async () => {
  const ev = await insertEvent({ trackId: 4, protected: 1, protectionSource: "MANUAL" });
  const al = await insertAlert({ eventId: ev, protected: 1, protectionSource: null });
  const code = await alertCodeFor(al);
  const user = await insertUser("SECURITY_OPERATOR");

  await alertService.saveAlert(code, actorFor(user.id));
  const _unsaved = await alertService.unsaveAlert(code, actorFor(user.id));

  const [alRow] = await pool.execute("SELECT is_protected, protection_source, protected_by FROM alerts WHERE id = ?", [al]);
  assert.strictEqual(alRow[0].is_protected, 1, "legacy (NULL-source) protection must survive unsave");
  assert.strictEqual(alRow[0].protection_source, null);

  const [evRow] = await pool.execute("SELECT is_protected, protection_source FROM events WHERE id = ?", [ev]);
  assert.strictEqual(evRow[0].is_protected, 1, "MANUAL event protection must survive unsave");
  assert.strictEqual(evRow[0].protection_source, "MANUAL");
});

test("saved-only listing is enforced by the repository filter", async () => {
  const evA = await insertEvent({ trackId: 5 });
  const alA = await insertAlert({ eventId: evA });
  const codeA = await alertCodeFor(alA);
  const user = await insertUser("SECURITY_OPERATOR");
  await alertService.saveAlert(codeA, actorFor(user.id));

  await insertAlert({ eventId: await insertEvent({ trackId: 6 }) });

  const saved = await alertRepository.findMany({ saved: true, includeDeleted: true });
  assert.ok(saved.items.length >= 1, "saved filter must return saved alerts");
  assert.ok(saved.items.every((item) => item.is_saved === 1), "saved filter must return only saved alerts");
  assert.ok(saved.items.some((item) => item.alert_code === codeA), "the saved alert must appear");
});

test("RBAC: operator may save, analyst and anonymous may not", async () => {
  const ev = await insertEvent({ trackId: 7 });
  const al = await insertAlert({ eventId: ev });
  const code = await alertCodeFor(al);
  const operator = await insertUser("SECURITY_OPERATOR");
  const analyst = await insertUser("AUDITOR_ANALYST");

  const login = (email) =>
    request(app).post("/api/auth/login").send({ email, password: "Saved#Test#2026!" });

  const opToken = (await login(operator.email)).body.data.accessToken;
  const anToken = (await login(analyst.email)).body.data.accessToken;

  const opRes = await request(app).post(`/api/alerts/${code}/save`).set("Authorization", `Bearer ${opToken}`);
  assert.strictEqual(opRes.status, 200, "operator should be able to save an alert");

  const anRes = await request(app).post(`/api/alerts/${code}/save`).set("Authorization", `Bearer ${anToken}`);
  assert.strictEqual(anRes.status, 403, "analyst must not be able to save an alert");

  const anonRes = await request(app).post(`/api/alerts/${code}/save`);
  assert.strictEqual(anonRes.status, 401, "anonymous must be rejected");
});

test("saved alerts and their incident survive retention; unsaved controls are purged", async () => {
  // Saved: old RESOLVED alert + anchor event + evidence, protected by saving.
  const evSaved = await insertEvent({ trackId: 10 });
  const alSaved = await insertAlert({ eventId: evSaved, severity: "MEDIUM", status: "RESOLVED" });
  const evSavedEvidence = await insertEvidence({ eventId: evSaved, alertId: alSaved });
  const codeSaved = await alertCodeFor(alSaved);
  const user = await insertUser("SECURITY_OPERATOR");
  await alertService.saveAlert(codeSaved, actorFor(user.id));

  // Control: identical but never saved and never protected.
  const evControl = await insertEvent({ trackId: 11 });
  const alControl = await insertAlert({ eventId: evControl, severity: "MEDIUM", status: "RESOLVED" });
  const evControlEvidence = await insertEvidence({ eventId: evControl, alertId: alControl });

  const res = await retentionService.runRetentionCleanup({ mode: "manual" });
  assert.strictEqual(res.skipped, false);

  const [savedAlert] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [alSaved]);
  assert.strictEqual(savedAlert[0].deleted_at, null, "saved alert must survive retention");
  const [savedEvent] = await pool.execute("SELECT * FROM events WHERE id = ?", [evSaved]);
  assert.strictEqual(savedEvent[0].deleted_at, null, "saved alert's anchor event must survive retention");
  const [savedEvidence] = await pool.execute("SELECT COUNT(*) AS c FROM evidence WHERE id = ?", [evSavedEvidence]);
  assert.strictEqual(savedEvidence[0].c, 1, "saved alert's evidence must survive retention");

  const [controlAlert] = await pool.execute("SELECT * FROM alerts WHERE id = ?", [alControl]);
  assert.ok(controlAlert[0].deleted_at, "unsaved RESOLVED alert must be purged");
  const [controlEvent] = await pool.execute("SELECT * FROM events WHERE id = ?", [evControl]);
  assert.ok(controlEvent[0].deleted_at, "unsaved alert's event must be purged");
  const [controlEvidence] = await pool.execute("SELECT COUNT(*) AS c FROM evidence WHERE id = ?", [evControlEvidence]);
  assert.strictEqual(controlEvidence[0].c, 0, "unsaved incident's orphaned evidence must be removed");
});

test("delete and unprotect are blocked while an alert is saved", async () => {
  const ev = await insertEvent({ trackId: 12 });
  const al = await insertAlert({ eventId: ev });
  const code = await alertCodeFor(al);
  const user = await insertUser("SECURITY_OPERATOR");
  await alertService.saveAlert(code, actorFor(user.id));

  await assert.rejects(
    () => alertService.unprotectAlert(code, actorFor(user.id)),
    (err) => err.statusCode === 409 && /Saved Alerts/.test(err.message),
    "unprotect must be rejected while saved"
  );
  await assert.rejects(
    () => alertService.deleteAlert(code, {}, actorFor(user.id)),
    (err) => err.statusCode === 409 && /Saved Alerts/.test(err.message),
    "delete must be rejected while saved"
  );
});