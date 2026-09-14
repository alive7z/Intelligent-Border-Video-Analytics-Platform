// Explainable event association only. Track IDs never identify a person across
// cameras. No correlation changes risk, creates an alert, or implies identity.
const crypto = require("crypto");
const { getPool } = require("../config/database");
const eventRepository = require("../repositories/event.repository");
const cameraRepository = require("../repositories/camera.repository");
const { assertCameraAccess } = require("./camera.service");
const { toSafeEvent } = require("./event.service");
const ApiError = require("../utils/ApiError");

const WINDOW_SECONDS = 120;
const contextOf = (event) => {
  if (event.context) return event.context;
  if (typeof event.context_json === "object") return event.context_json || {};
  try { return JSON.parse(event.context_json || "{}"); } catch (_) { return {}; }
};
const reasonCodes = (ctx) => (Array.isArray(ctx.reasons) ? ctx.reasons : [])
  .map((reason) => typeof reason === "string" ? reason : reason?.code).filter(Boolean);
const validPlate = (event, ctx) => event.event_type === "PLATE_DETECTED" &&
  ctx.validationResult === "VALID_FORMAT" && Number(ctx.ocrConfidence) >= 0.9 &&
  /^(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(ctx.plateText || "");

function relationFor(source, candidate, neighbors = []) {
  const a = contextOf(source);
  const b = contextOf(candidate);
  if (source.event_code === candidate.event_code) return null;
  const delta = Math.abs(new Date(source.occurred_at) - new Date(candidate.occurred_at)) / 1000;
  if (!Number.isFinite(delta) || delta > WINDOW_SECONDS) return null;
  if (source.camera_code === candidate.camera_code) {
    if (a.streamSessionId && a.streamSessionId === b.streamSessionId &&
        source.track_id != null && String(source.track_id) === String(candidate.track_id)) {
      return "Same camera, stream session and local track";
    }
    return null;
  }
  if (!neighbors.includes(candidate.camera_code)) return null;
  if (validPlate(source, a) && validPlate(candidate, b) && a.plateText === b.plateText) {
    return "Matching validated high-confidence registration on a configured neighbor";
  }
  const suspicious = (e) => e.event_type === "SUSPICIOUS_ACTIVITY" &&
    ["MEDIUM", "HIGH", "CRITICAL"].includes(e.severity) && Number(e.risk_score) >= 40;
  const shared = reasonCodes(a).filter((code) => reasonCodes(b).includes(code));
  if (suspicious(source) && suspicious(candidate) && shared.length) {
    return `Shared risk conditions on a configured neighbor: ${[...new Set(shared)].sort().join(", ")}`;
  }
  return null;
}

async function getRelatedEvents(eventCode, actor) {
  const source = await eventRepository.findByCode(eventCode);
  if (!source) throw new ApiError(404, "Event not found");
  const camera = await cameraRepository.findByCode(source.camera_code);
  if (!camera || camera.deleted_at) throw new ApiError(404, "Camera not found");
  await assertCameraAccess(camera, actor);
  const neighbors = camera.neighbor_camera_codes;
  const codes = [camera.camera_code, ...neighbors];
  const operatorFilter = actor?.role === "SECURITY_OPERATOR"
    ? "AND EXISTS (SELECT 1 FROM operator_camera_assignments oca WHERE oca.camera_id = c.id AND oca.operator_id = ?)" : "";
  const [rows] = await getPool().execute(
    `SELECT e.*, c.camera_code, c.name AS camera_name FROM events e
       JOIN cameras c ON c.id = e.camera_id
      WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL
        AND c.camera_code IN (${codes.map(() => "?").join(",")})
        AND e.occurred_at BETWEEN DATE_SUB(?, INTERVAL 120 SECOND) AND DATE_ADD(?, INTERVAL 120 SECOND)
        ${operatorFilter}
      ORDER BY e.occurred_at DESC, e.id DESC LIMIT 201`,
    [...codes, source.occurred_at, source.occurred_at, ...(operatorFilter ? [actor.userId] : [])]
  );
  const items = rows.slice(0, 200).flatMap((candidate) => {
    const reason = relationFor(source, candidate, neighbors);
    if (!reason) return [];
    const pair = [source.event_code, candidate.event_code].sort().join(":");
    return [{ ...toSafeEvent(candidate), context: contextOf(candidate), correlation: {
      id: crypto.createHash("sha256").update(pair).digest("hex"), reason,
      confidence: reason.startsWith("Shared risk") ? "MEDIUM" : "HIGH",
      identityVerified: false, windowSeconds: WINDOW_SECONDS,
    } }];
  });
  return { items, truncated: rows.length > 200, windowSeconds: WINDOW_SECONDS,
    identityVerified: false, notice: "Event association only; not person identification or proof of movement." };
}

module.exports = { getRelatedEvents, relationFor };
