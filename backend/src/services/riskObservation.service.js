const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { assertRequired, assertOneOf } = require("../utils/validation");
const cameraRepository = require("../repositories/camera.repository");
const eventRepository = require("../repositories/event.repository");
const realtimeService = require("../realtime/realtime.service");
const alertManager = require("./alertManager.service");
const { toSafeEvent } = require("./event.service");

// Controlled allowlist of severities the AI Risk Engine (Phase 10) may emit.
// Each risk observation maps to a SUSPICIOUS_ACTIVITY event — never an alert.
const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

const RISK_SOURCE = "AI_RISK_ENGINE";
const MAX_INCIDENT_TIMELINE_ENTRIES = 100;

const reasonCode = (reason) => String(
  typeof reason === "string" ? reason : (reason && (reason.code || reason.type)) || ""
).toUpperCase();

const isRestrictedVehicleIntrusion = (obs) =>
  String(obs.objectType || "").toUpperCase() === "VEHICLE" &&
  (obs.reasons || []).some((reason) => reasonCode(reason) === "RESTRICTED_ZONE_ENTRY");

const incidentKeyFor = (cameraId, obs) =>
  `restricted-zone:${cameraId}:${obs.streamSessionId || "legacy"}:${String(obs.trackId)}`;

const occurredAtSql = (value) => new Date(value).toISOString().slice(0, 19).replace("T", " ");

const riskTimelineEntry = (obs, first) => ({
  type: first ? "RESTRICTED_ZONE_ENTERED" : "RISK_UPDATED",
  event: first ? "Vehicle entered restricted zone" : "Incident risk updated",
  time: new Date(obs.occurredAt).toISOString(),
  riskScore: obs.riskScore,
  severity: obs.riskSeverity,
  riskFactors: obs.reasons || [],
});

const mergeIncidentContext = (existing, cameraId, obs, observationId) => {
  const prior = existing?.context || {};
  const observationIds = [...(prior.observationIds || [])];
  if (!observationIds.includes(observationId)) observationIds.push(observationId);
  const timeline = [...(prior.timeline || []), riskTimelineEntry(obs, !existing)]
    .slice(-MAX_INCIDENT_TIMELINE_ENTRIES);
  return {
    ...prior,
    source: RISK_SOURCE,
    observationId,
    observationIds: observationIds.slice(-MAX_INCIDENT_TIMELINE_ENTRIES),
    incidentBased: true,
    incidentType: "RESTRICTED_ZONE_VEHICLE_INTRUSION",
    incidentKey: incidentKeyFor(cameraId, obs),
    trackId: obs.trackId,
    objectType: "VEHICLE",
    streamSessionId: obs.streamSessionId || null,
    riskScore: obs.riskScore,
    riskSeverity: obs.riskSeverity,
    reasons: obs.reasons || [],
    evidence: obs.evidence || [],
    sourceTimestampMs: obs.sourceTimestampMs ?? prior.sourceTimestampMs ?? null,
    vehiclePlate: (obs.plateText || prior.vehiclePlate || "").trim() || null,
    startedAt: prior.startedAt || new Date(obs.occurredAt).toISOString(),
    lastUpdatedAt: new Date(obs.occurredAt).toISOString(),
    timeline,
  };
};

const validateRiskObservation = (obs) => {
  assertRequired(obs.observationId, "observation.observationId is required");
  if (typeof obs.observationId !== "string") {
    throw new ApiError(400, "observation.observationId must be a string");
  }
  assertRequired(obs.trackId, "observation.trackId is required");
  assertRequired(obs.riskScore, "observation.riskScore is required");
  if (typeof obs.riskScore !== "number" || Number.isNaN(obs.riskScore)) {
    throw new ApiError(400, "observation.riskScore must be a number");
  }
  if (obs.riskScore < 0 || obs.riskScore > 100) {
    throw new ApiError(400, "observation.riskScore must be between 0 and 100");
  }
  assertRequired(obs.riskSeverity, "observation.riskSeverity is required");
  assertOneOf(obs.riskSeverity, SEVERITIES, "riskSeverity");
  assertRequired(obs.occurredAt, "observation.occurredAt is required");

  if (obs.reasons !== undefined && obs.reasons !== null && !Array.isArray(obs.reasons)) {
    throw new ApiError(400, "observation.reasons must be an array");
  }
  if (obs.evidence !== undefined && obs.evidence !== null && !Array.isArray(obs.evidence)) {
    throw new ApiError(400, "observation.evidence must be an array");
  }
  if (
    obs.streamSessionId !== undefined && obs.streamSessionId !== null &&
    typeof obs.streamSessionId !== "string"
  ) {
    throw new ApiError(400, "observation.streamSessionId must be a string");
  }
  if (obs.plateText !== undefined && obs.plateText !== null) {
    if (typeof obs.plateText !== "string") {
      throw new ApiError(400, "observation.plateText must be a string");
    }
    if (obs.plateText.trim().length > 32) {
      throw new ApiError(400, "observation.plateText must be at most 32 characters");
    }
  }

  return obs;
};

// Entry point: accepts a batch of new risk observations, validates the camera
// and each observation, dedupes by observationId, and creates SUSPICIOUS_ACTIVITY
// events carrying risk_score + severity. Emits event:new only — NEVER alert:new.
const ingestRiskObservations = async ({ schemaVersion, cameraCode, observations }) => {
  if (schemaVersion !== 1) {
    throw new ApiError(400, "Unsupported schemaVersion");
  }
  assertRequired(cameraCode, "cameraCode is required");
  assertRequired(observations, "observations is required");
  if (!Array.isArray(observations)) {
    throw new ApiError(400, "observations must be an array");
  }
  if (observations.length === 0) {
    return { eventsCreated: 0, eventsUpdated: 0, alertActions: [], eventBindings: {} };
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }
  if (!camera.enabled) {
    throw new ApiError(400, "Camera is disabled");
  }

  const created = [];
  const decisions = [];
  const eventBindings = {};
  let eventsUpdated = 0;

  for (const obs of observations) {
    let decision = { action: "NONE" };

    validateRiskObservation(obs);

    const observationId = String(obs.observationId);
    const existing =
      observationId != null
        ? await eventRepository.findByObservationId(camera.id, observationId)
        : null;
    if (existing) {
      // A prior request may have committed its event then failed before the
      // Alert Manager finished. Retry the idempotent decision, not the event.
      if (
        existing.context?.incidentBased &&
        existing.context?.observationIds?.includes(observationId) &&
        existing.context?.alertDecision
      ) {
        decisions.push({ action: "NONE", eventId: existing.id });
        eventBindings[observationId] = { eventId: existing.event_code, incidentAttached: true };
        continue;
      }
      existing.camera_code = camera.camera_code;
      decisions.push(await alertManager.processRiskEvent(existing));
      if (existing.context?.incidentBased) {
        eventBindings[observationId] = { eventId: existing.event_code, incidentAttached: true };
      }
      continue;
    }

    if (isRestrictedVehicleIntrusion(obs)) {
      const incidentKey = incidentKeyFor(camera.id, obs);
      const conn = await eventRepository.beginTransaction();
      let event;
      let wasCreated = false;
      try {
        // Serializing by camera makes distinct concurrent frame observations
        // converge on one row before the unique incident key is consulted.
        await conn.execute("SELECT id FROM cameras WHERE id = ? FOR UPDATE", [camera.id]);
        const incident = await eventRepository.findIncidentByKey(
          camera.id, incidentKey, conn, { forUpdate: true }
        );
        if (incident?.context?.observationIds?.includes(observationId)) {
          await eventRepository.commit(conn);
          decisions.push({ action: "NONE", eventId: incident.id });
          eventBindings[observationId] = { eventId: incident.event_code, incidentAttached: true };
          continue;
        }
        const context = mergeIncidentContext(incident, camera.id, obs, observationId);
        if (incident) {
          event = await eventRepository.updateIncident({
            id: incident.id,
            objectType: "VEHICLE",
            riskScore: obs.riskScore,
            severity: obs.riskSeverity,
            context,
            status: "ACTIVE",
            conn,
          });
          eventsUpdated += 1;
        } else {
          event = await eventRepository.create({
            eventCode: crypto.randomUUID(),
            incidentKey,
            cameraId: camera.id,
            eventType: "SUSPICIOUS_ACTIVITY",
            objectType: "VEHICLE",
            trackId: obs.trackId,
            confidence: null,
            riskScore: obs.riskScore,
            severity: obs.riskSeverity,
            status: "ACTIVE",
            context,
            occurredAt: occurredAtSql(obs.occurredAt),
          }, conn);
          wasCreated = event.wasCreated !== false;
        }
        await eventRepository.commit(conn);
      } catch (err) {
        await eventRepository.rollback(conn);
        throw err;
      } finally {
        await eventRepository.release(conn);
      }

      event.camera_code = camera.camera_code;
      if (wasCreated) {
        created.push(toSafeEvent(event));
        realtimeService.emitEventNew(event);
      } else {
        realtimeService.emitEventUpdated(event);
      }
      decisions.push(await alertManager.processRiskEvent(event));
      eventBindings[observationId] = { eventId: event.event_code, incidentAttached: true };
      continue;
    }

    const context = {
      source: RISK_SOURCE,
      observationId,
      trackId: obs.trackId,
      riskScore: obs.riskScore,
      riskSeverity: obs.riskSeverity,
    };
    if (obs.sourceTimestampMs !== undefined && obs.sourceTimestampMs !== null) {
      context.sourceTimestampMs = obs.sourceTimestampMs;
    }
    if (obs.streamSessionId) {
      context.streamSessionId = obs.streamSessionId;
    }
    if (obs.objectType) {
      context.objectType = obs.objectType;
    }
    if (obs.reasons && obs.reasons.length > 0) {
      context.reasons = obs.reasons;
    }
    if (obs.evidence && obs.evidence.length > 0) {
      context.evidence = obs.evidence;
    }
    if (obs.plateText && typeof obs.plateText === "string") {
      context.vehiclePlate = obs.plateText.trim();
    }

    const event = await eventRepository.create({
      eventCode: crypto.randomUUID(),
      cameraId: camera.id,
      eventType: "SUSPICIOUS_ACTIVITY",
      objectType: obs.objectType || null,
      trackId: obs.trackId,
      confidence: null,
      riskScore: obs.riskScore,
      severity: obs.riskSeverity,
      status: "NEW",
      context,
      occurredAt: occurredAtSql(obs.occurredAt),
    });

    if (event.wasCreated !== false) {
      const safe = toSafeEvent(event);
      realtimeService.emitEventNew(event);
      created.push(safe);
    }

    // Phase 11 — Node Alert Manager decides whether this risk event becomes an
    // alert. Python never inserts alerts directly.
    decision = await alertManager.processRiskEvent(event);
    decisions.push(decision);
  }

  const alertActions = alertManager.buildAlertActions(observations, decisions);
  return { eventsCreated: created.length, eventsUpdated, alertActions, eventBindings };
};

module.exports = {
  ingestRiskObservations,
  validateRiskObservation,
  RISK_SOURCE,
  SEVERITIES,
  isRestrictedVehicleIntrusion,
  incidentKeyFor,
};
