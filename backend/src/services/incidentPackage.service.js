// Assemble real, persisted local incident data; never reconstruct missing images
// or imply cross-camera person identity. The package is read-only and bounded.
const { getPool } = require("../config/database");
const alerts = require("../repositories/alert.repository");
const events = require("../repositories/event.repository");
const cameras = require("../repositories/camera.repository");
const { assertCameraAccess, toSafeCamera } = require("./camera.service");
const { toSafeEvidence } = require("./evidence.service");
const { toSafeEvent } = require("./event.service");
const { toSafeAlert } = require("./alert.service");
const ApiError = require("../utils/ApiError");
const parse = (value) => {
  if (typeof value === "object") return value || {};
  try { return JSON.parse(value || "{}"); } catch (_) { return {}; }
};

async function getIncidentPackage(alertCode, actor) {
  const alert = await alerts.findByCode(alertCode);
  if (!alert) throw new ApiError(404, "Alert not found");
  const camera = await cameras.findById(alert.camera_id);
  if (!camera || camera.deleted_at) throw new ApiError(404, "Camera not found");
  await assertCameraAccess(camera, actor);
  const anchor = await events.findById(alert.event_id);
  if (!anchor || anchor.deleted_at) throw new ApiError(404, "Incident event not available");
  const session = anchor.context?.streamSessionId;
  let rows = [anchor];
  if (session && anchor.track_id != null) {
    // A resolved previous alert on the same continuous local track bounds this
    // package; it must not pull evidence from that earlier closed incident.
    const [[boundary]] = await getPool().execute(
      `SELECT MAX(a.resolved_at) AS previous_end FROM alerts a JOIN events e ON e.id = a.event_id
        WHERE a.camera_id = ? AND e.track_id = ? AND a.id <> ?
          AND JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.streamSessionId')) = ?
          AND a.resolved_at < ?`,
      [camera.id, anchor.track_id, alert.id, session, alert.createdAt]
    );
    const params = [camera.id, anchor.track_id, session];
    let timeFilter = "";
    if (boundary.previous_end) { timeFilter += " AND e.occurred_at > ?"; params.push(boundary.previous_end); }
    if (alert.resolved_at) { timeFilter += " AND e.occurred_at <= ?"; params.push(alert.resolved_at); }
    params.push(alert.id);
    [rows] = await getPool().execute(
      `SELECT e.*, c.camera_code, c.name AS camera_name FROM events e JOIN cameras c ON c.id = e.camera_id
        WHERE e.camera_id = ? AND e.track_id = ?
          AND JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.streamSessionId')) = ?
          AND e.deleted_at IS NULL ${timeFilter}
          AND (JSON_EXTRACT(e.context_json, '$.alertDecision.alertId') IS NULL
            OR JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.alertDecision.alertId')) = ?)
        ORDER BY e.occurred_at, e.id LIMIT 501`, params
    );
  }
  const truncated = rows.length > 500;
  rows = rows.slice(0, 500);
  if (!rows.some((row) => row.id === anchor.id)) rows.unshift(anchor);
  const ids = rows.map((row) => row.id);
  const [media] = await getPool().execute(
    `SELECT ev.evidence_code, ev.evidence_type, ev.mime_type, ev.file_size_bytes, ev.checksum,
            ev.captured_at, ev.created_at, c.camera_code, e.event_code, a.alert_code
       FROM evidence ev JOIN cameras c ON c.id = ev.camera_id
       LEFT JOIN events e ON e.id = ev.event_id LEFT JOIN alerts a ON a.id = ev.alert_id
      WHERE ev.camera_id = ? AND ev.evidence_type <> 'INCIDENT_CLIP' AND (ev.alert_id = ? OR
        (ev.alert_id IS NULL AND ev.event_id IN (${ids.map(() => "?").join(",")})))
      ORDER BY ev.captured_at, ev.id LIMIT 501`, [camera.id, alert.id, ...ids]
  );
  const [audit] = await getPool().execute(
    "SELECT id, action, created_at, details_json FROM audit_logs WHERE entity_type = 'alert' AND entity_id = ? ORDER BY created_at, id LIMIT 201",
    [alertCode]
  );
  const timeline = [];
  rows.forEach((row) => {
    const context = parse(row.context || row.context_json);
    const incidentEntries = Array.isArray(context.timeline) ? context.timeline : [];
    if (incidentEntries.length) {
      incidentEntries.forEach((entry, index) => timeline.push({
        id: `${row.event_code}-incident-${index}`,
        time: entry.time || row.occurred_at,
        kind: entry.type || "INCIDENT_UPDATE",
        event: entry.event || entry.type || "Incident updated",
        severity: entry.severity || null,
        riskScore: entry.riskScore ?? null,
        riskFactors: entry.riskFactors || null,
        vehiclePlate: entry.vehiclePlate || null,
        eventCode: row.event_code,
      }));
    } else {
      timeline.push({
        id: row.event_code, time: row.occurred_at, kind: "EVENT", event: row.event_type,
        severity: row.severity, riskScore: row.risk_score, eventCode: row.event_code,
      });
    }
  });
  audit.slice(0, 200).forEach((entry) => {
    const detail = parse(entry.details_json);
    timeline.push({ id: `audit-${entry.id}`, time: entry.created_at, kind: "OPERATOR_OR_ALERT_ACTION",
      event: entry.action, severity: detail.toSeverity || detail.severity || null });
  });
  // Some legacy alerts predate audit coverage; only persisted timestamps fill
  // those lifecycle entries, never a guessed detection/context history.
  const lifecycle = [["ALERT_CREATED", alert.createdAt], ["ALERT_ACKNOWLEDGED", alert.acknowledged_at], ["ALERT_RESOLVED", alert.resolved_at]];
  for (const [event, time] of lifecycle) {
    if (time && !timeline.some((entry) => entry.event === event)) timeline.push({ id: `${alertCode}-${event}`, time, kind: "LIFECYCLE", event });
  }
  timeline.sort((a, b) => new Date(a.time) - new Date(b.time));
  return {
    incidentId: alertCode, alert: toSafeAlert(alert), camera: toSafeCamera(camera),
    trackId: anchor.track_id, streamSessionId: session || null,
    scope: session ? "CAMERA_SESSION_TRACK" : "ANCHOR_EVENT_ONLY",
    events: rows.map((row) => ({ ...toSafeEvent(row), context: parse(row.context || row.context_json) })),
    evidence: media.slice(0, 500).map(toSafeEvidence), timeline,
    truncated: truncated || media.length > 500 || audit.length > 200,
    notice: "Persisted records only. Missing evidence or history is not reconstructed. No biometric identity matching.",
  };
}

module.exports = { getIncidentPackage };
