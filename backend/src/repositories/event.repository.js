const { getPool } = require("../config/database");
const crypto = require("crypto");
const { parsePagination, parseSort } = require("../utils/pagination");

const ALLOWED_SORT = ["occurred_at", "created_at", "severity", "risk_score", "confidence"];

const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
};

const mapEvent = (row) => {
  if (!row) return null;
  return {
    ...row,
    confidence: row.confidence === null ? null : Number(row.confidence),
    context: parseJson(row.context_json),
  };
};

const getSummary = async () => {
  const [[row]] = await getPool().execute(
    `SELECT
       SUM(occurred_at >= UTC_DATE()) AS total_today,
       SUM(severity IN ('HIGH','CRITICAL')) AS security_events,
       SUM(event_type IN ('PLATE_DETECTED','ANPR_DETECTED')) AS anpr_events,
       SUM(status = 'ACKNOWLEDGED') AS acknowledged
     FROM events WHERE deleted_at IS NULL`
  );
  return {
    totalToday: Number(row.total_today || 0),
    securityEvents: Number(row.security_events || 0),
    anprEvents: Number(row.anpr_events || 0),
    acknowledged: Number(row.acknowledged || 0),
  };
};

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const findMany = async (filters = {}) => {
  const { page, limit, offset } = parsePagination(filters);
  const { field, direction } = parseSort(filters.sort, ALLOWED_SORT, "occurred_at");

  const conditions = [];
  const params = [];

  if (!filters.includeDeleted) {
    conditions.push("e.deleted_at IS NULL");
  }
  if (filters.cameraId) {
    conditions.push("e.camera_id = (SELECT id FROM cameras WHERE camera_code = ?)");
    params.push(filters.cameraId);
  }
  if (filters.eventType) {
    conditions.push("e.event_type = ?");
    params.push(filters.eventType);
  }
  if (filters.objectType) {
    conditions.push("e.object_type = ?");
    params.push(filters.objectType);
  }
  if (filters.severity) {
    conditions.push("e.severity = ?");
    params.push(filters.severity);
  }
  if (filters.status) {
    conditions.push("e.status = ?");
    params.push(filters.status);
  }
  if (filters.minRiskScore !== undefined && filters.minRiskScore !== null && filters.minRiskScore !== "") {
    conditions.push("e.risk_score >= ?");
    params.push(filters.minRiskScore);
  }
  if (filters.startDate) {
    conditions.push("e.occurred_at >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push("e.occurred_at < ?");
    params.push(filters.endDate);
  }
  if (filters.search) {
    conditions.push("(e.event_code LIKE ? OR e.event_type LIKE ? OR e.object_type LIKE ? OR e.track_id LIKE ? OR c.camera_code LIKE ? OR c.name LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.plate')) LIKE ?)");
    const like = `%${filters.search}%`;
    params.push(like, like, like, like, like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [countRows] = await getPool().execute(
    `SELECT COUNT(*) AS total FROM events e LEFT JOIN cameras c ON c.id = e.camera_id ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await getPool().execute(
    `SELECT e.id, e.event_code, e.incident_key, e.camera_id, e.event_type, e.object_type, e.track_id,
            e.confidence, e.risk_score, e.severity, e.status,
            e.context_json, e.occurred_at, e.created_at,
            e.is_protected, e.protected_by, e.protected_at, e.protection_source,
            e.deleted_at,
            al.alert_code AS related_alert_code,
            al.severity AS related_alert_severity,
            al.status AS related_alert_status,
            al.acknowledged_by AS related_alert_acknowledged_by,
            al.acknowledged_at AS related_alert_acknowledged_at,
            ack_user.full_name AS related_alert_acknowledged_by_name,
            c.camera_code, c.name AS camera_name
       FROM events e
       LEFT JOIN cameras c ON c.id = e.camera_id
       LEFT JOIN alerts al ON al.id = (
         SELECT picked.id FROM alerts picked
          WHERE picked.event_id = e.id AND picked.deleted_at IS NULL
          ORDER BY picked.id LIMIT 1
       )
       LEFT JOIN users ack_user ON ack_user.id = al.acknowledged_by
       ${where}
       ORDER BY e.${field} ${direction} LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapEvent),
    pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
};

const findByCode = async (eventCode, { includeDeleted = false } = {}) => {
  const deletedClause = includeDeleted ? "" : " AND e.deleted_at IS NULL";
  const [rows] = await getPool().execute(
    `SELECT e.id, e.event_code, e.incident_key, e.camera_id, e.event_type, e.object_type, e.track_id,
            e.confidence, e.risk_score, e.severity, e.status,
            e.context_json, e.occurred_at, e.created_at,
            e.is_protected, e.protected_by, e.protected_at, e.protection_source,
            e.deleted_at,
            al.alert_code AS related_alert_code,
            al.severity AS related_alert_severity,
            al.status AS related_alert_status,
            al.acknowledged_by AS related_alert_acknowledged_by,
            al.acknowledged_at AS related_alert_acknowledged_at,
            ack_user.full_name AS related_alert_acknowledged_by_name,
            c.camera_code, c.name AS camera_name
       FROM events e
       LEFT JOIN cameras c ON c.id = e.camera_id
       LEFT JOIN alerts al ON al.id = (
         SELECT picked.id FROM alerts picked
          WHERE picked.event_id = e.id AND picked.deleted_at IS NULL
          ORDER BY picked.id LIMIT 1
       )
       LEFT JOIN users ack_user ON ack_user.id = al.acknowledged_by
       WHERE e.event_code = ?${deletedClause} LIMIT 1`,
    [eventCode]
  );
  return mapEvent(rows[0] || null);
};

const findById = async (id, conn) => {
  const [rows] = await (conn || getPool()).execute(
    `SELECT e.id, e.event_code, e.incident_key, e.camera_id, e.event_type, e.object_type, e.track_id,
            e.confidence, e.risk_score, e.severity, e.status,
            e.context_json, e.occurred_at, e.created_at,
            e.is_protected, e.protected_by, e.protected_at, e.protection_source,
            e.deleted_at,
            al.alert_code AS related_alert_code,
            al.severity AS related_alert_severity,
            al.status AS related_alert_status,
            al.acknowledged_by AS related_alert_acknowledged_by,
            al.acknowledged_at AS related_alert_acknowledged_at,
            ack_user.full_name AS related_alert_acknowledged_by_name,
            c.camera_code, c.name AS camera_name
       FROM events e
       LEFT JOIN cameras c ON c.id = e.camera_id
       LEFT JOIN alerts al ON al.id = (
         SELECT picked.id FROM alerts picked
          WHERE picked.event_id = e.id AND picked.deleted_at IS NULL
          ORDER BY picked.id LIMIT 1
       )
       LEFT JOIN users ack_user ON ack_user.id = al.acknowledged_by
       WHERE e.id = ? LIMIT 1`,
    [id]
  );
  return mapEvent(rows[0] || null);
};

const resolveCodeToId = async (eventCode) => {
  const [rows] = await getPool().execute(
    "SELECT id FROM events WHERE event_code = ? LIMIT 1",
    [eventCode]
  );
  return rows[0] ? rows[0].id : null;
};

// Find an event by its observation_id stored inside context_json (idempotency).
const findByObservationId = async (cameraId, observationId) => {
  const [rows] = await getPool().execute(
    `SELECT e.* FROM events e
     WHERE e.camera_id = ?
       AND (
         JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.observationId')) = ?
         OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(e.context_json, '$.observationIds'), JSON_ARRAY()), JSON_QUOTE(?))
         OR JSON_CONTAINS(COALESCE(JSON_EXTRACT(e.context_json, '$.anprObservationIds'), JSON_ARRAY()), JSON_QUOTE(?))
       )
     LIMIT 1`,
    [cameraId, observationId, observationId, observationId]
  );
  return mapEvent(rows[0] || null);
};

const findIncidentByKey = async (cameraId, incidentKey, conn, { forUpdate = false } = {}) => {
  const executor = conn || getPool();
  const [rows] = await executor.execute(
    `SELECT e.* FROM events e
      WHERE e.camera_id = ? AND e.incident_key = ? AND e.deleted_at IS NULL
      LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
    [cameraId, incidentKey]
  );
  return mapEvent(rows[0] || null);
};

const updateIncident = async ({ id, objectType, riskScore, severity, context, status, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE events
        SET object_type = COALESCE(?, object_type), risk_score = ?, severity = ?,
            status = COALESCE(?, status), context_json = ?
      WHERE id = ?`,
    [objectType || null, riskScore, severity, status || null, JSON.stringify(context || {}), id]
  );
  return findById(id, executor);
};

const updateIncidentContext = async ({ id, context, conn }) => {
  const executor = conn || getPool();
  await executor.execute("UPDATE events SET context_json = ? WHERE id = ?", [JSON.stringify(context || {}), id]);
  return findById(id, executor);
};

// Session-local tracker identity is the stable idempotency key for detection
// events. observationId only deduplicates retries of one HTTP payload; a fresh
// UUID must not create another PERSON_DETECTED for the same live track.
const findDetectionBySessionTrack = async (
  cameraId,
  streamSessionId,
  trackId,
  eventType
) => {
  const [rows] = await getPool().execute(
    `SELECT e.* FROM events e
     WHERE e.camera_id = ?
       AND e.track_id = ?
       AND e.event_type = ?
       AND JSON_UNQUOTE(JSON_EXTRACT(e.context_json, '$.streamSessionId')) = ?
     LIMIT 1`,
    [cameraId, String(trackId), eventType, streamSessionId]
  );
  return mapEvent(rows[0] || null);
};

// Insert a new event. event_code is a UUID (CHAR(36)). context is stored as JSON.
const create = async (data, conn) => {
  const executor = conn || getPool();
  const context = data.context || {};
  const trackScoped = ["PERSON_DETECTED", "VEHICLE_DETECTED", "PLATE_DETECTED", "FACE_DETECTED"].includes(data.eventType)
    && context.streamSessionId && data.trackId !== undefined && data.trackId !== null;
  // Reuse the existing unique event_code constraint, avoiding a destructive
  // migration over historical duplicate observations. The key includes the
  // source/type and complete camera/session/track identity, never just trackId.
  const identity = data.incidentKey
    ? ["ibvap-incident-v1", data.incidentKey]
    : trackScoped
    ? ["ibvap-track-v1", data.cameraId, context.streamSessionId, String(data.trackId), data.eventType]
    : context.observationId
      ? ["ibvap-observation-v1", data.cameraId, data.eventType, context.observationId]
      : null;
  let eventCode = data.eventCode;
  if (identity) {
    const hash = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    eventCode = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }
  let result;
  try {
    [result] = await executor.execute(
    `INSERT INTO events
       (event_code, incident_key, camera_id, event_type, object_type, track_id,
        confidence, risk_score, severity, status, context_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventCode,
      data.incidentKey || null,
      data.cameraId,
      data.eventType,
      data.objectType || null,
      data.trackId !== undefined && data.trackId !== null ? String(data.trackId) : null,
      data.confidence,
      data.riskScore !== undefined ? data.riskScore : null,
      data.severity || "INFO",
      data.status || "NEW",
      data.context ? JSON.stringify(data.context) : null,
      data.occurredAt,
    ]
    );
  } catch (err) {
    if (err.code !== "ER_DUP_ENTRY" || !identity) throw err;
    const [rows] = await executor.execute(
      "SELECT id FROM events WHERE event_code = ? OR (? IS NOT NULL AND incident_key = ?) LIMIT 1",
      [eventCode, data.incidentKey || null, data.incidentKey || null]
    );
    if (!rows[0]) throw err;
    const event = await findById(rows[0].id, conn);
    Object.defineProperty(event, "wasCreated", { value: false });
    return event;
  }
  const event = await findById(result.insertId, conn);
  Object.defineProperty(event, "wasCreated", { value: true });
  return event;
};

const protect = async ({ id, userId, conn, source = "MANUAL" }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE events
        SET is_protected = 1,
            protected_by = COALESCE(protected_by, ?),
            protected_at = COALESCE(protected_at, UTC_TIMESTAMP()),
            protection_source = ?
      WHERE id = ?`,
    [userId, source, id]
  );
  return findById(id);
};

const unprotect = async ({ id, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE events
        SET is_protected = 0, protected_by = NULL, protected_at = NULL,
            protection_source = NULL
      WHERE id = ?`,
    [id]
  );
  return findById(id);
};

// Protect an event only if it is currently unprotected (used by Save Alert so
// the incident preservation never overrides existing manual/system protection).
const protectForSave = async ({ id, userId, conn }) => {
  const executor = conn || getPool();
  const [result] = await executor.execute(
    `UPDATE events
        SET is_protected = 1,
            protected_by = COALESCE(protected_by, ?),
            protected_at = COALESCE(protected_at, UTC_TIMESTAMP()),
            protection_source = COALESCE(protection_source, 'SAVED_ALERT')
      WHERE id = ? AND is_protected = 0 AND deleted_at IS NULL`,
    [userId, id]
  );
  return Number(result.affectedRows || 0) > 0 ? findById(id, executor) : null;
};

// Remove only SAVE-created event protection; manual/system protection survives.
const unprotectIfSavedProtection = async ({ id, conn }) => {
  const executor = conn || getPool();
  const [result] = await executor.execute(
    `UPDATE events
        SET is_protected = 0, protected_by = NULL, protected_at = NULL,
            protection_source = NULL
      WHERE id = ? AND protection_source = 'SAVED_ALERT'`,
    [id]
  );
  return Number(result.affectedRows || 0) > 0 ? findById(id, executor) : null;
};

const softDelete = async ({ id, userId, reason, conn }) => {
  const executor = conn || getPool();
  await executor.execute(
    `UPDATE events
        SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, deletion_reason = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [userId, reason || null, id]
  );
  return findById(id);
};

const beginTransaction = async () => {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  return conn;
};

const commit = async (conn) => conn.commit();
const rollback = async (conn) => conn.rollback();
const release = async (conn) => conn.release();

module.exports = {
  findMany,
  getSummary,
  findByCode,
  findById,
  resolveCodeToId,
  findByObservationId,
  findDetectionBySessionTrack,
  findIncidentByKey,
  updateIncident,
  updateIncidentContext,
  create,
  protect,
  unprotect,
  protectForSave,
  unprotectIfSavedProtection,
  softDelete,
  beginTransaction,
  commit,
  rollback,
  release,
  SEVERITIES,
  parseDate,
};
