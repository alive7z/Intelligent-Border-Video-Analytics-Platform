const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { assertRequired } = require("../utils/validation");
const cameraRepository = require("../repositories/camera.repository");
const eventRepository = require("../repositories/event.repository");
const plateRepository = require("../repositories/plate.repository");
const alertRepository = require("../repositories/alert.repository");
const realtimeService = require("../realtime/realtime.service");

const ANPR_SOURCE = "AI_ANPR_ENGINE";
const MAX_INCIDENT_TIMELINE_ENTRIES = 100;
const incidentKeyFor = (cameraId, obs) =>
  `restricted-zone:${cameraId}:${obs.streamSessionId || "legacy"}:${String(obs.vehicleTrackId)}`;

// Plate text is observational OCR only. We sanity-check that it is a
// reasonable plate string, but we NEVER derive ownership / registration /
// legality and never look it up against any blacklist.
const validatePlateText = (text) => {
  assertRequired(text, "observation.plateText is required");
  if (typeof text !== "string") {
    throw new ApiError(400, "observation.plateText must be a string");
  }
  const upper = text.toUpperCase();
  if (!/^[A-Z0-9-]{1,32}$/.test(upper)) {
    throw new ApiError(400, "observation.plateText contains unsupported characters");
  }
  return text;
};

// Validate a single plate observation. Throws 400 on malformed fields.
const validateAnprObservation = (obs) => {
  assertRequired(obs.observationId, "observation.observationId is required");
  if (typeof obs.observationId !== "string") {
    throw new ApiError(400, "observation.observationId must be a string");
  }
  assertRequired(obs.vehicleTrackId, "observation.vehicleTrackId is required");
  validatePlateText(obs.plateText);
  assertRequired(obs.occurredAt, "observation.occurredAt is required");

  if (
    obs.ocrConfidence !== undefined &&
    obs.ocrConfidence !== null &&
    (typeof obs.ocrConfidence !== "number" ||
      obs.ocrConfidence < 0 ||
      obs.ocrConfidence > 1)
  ) {
    throw new ApiError(400, "observation.ocrConfidence must be a number between 0 and 1");
  }
  if (
    obs.plateDetectionConfidence !== undefined &&
    obs.plateDetectionConfidence !== null &&
    (typeof obs.plateDetectionConfidence !== "number" ||
      obs.plateDetectionConfidence < 0 ||
      obs.plateDetectionConfidence > 1)
  ) {
    throw new ApiError(400, "observation.plateDetectionConfidence must be a number between 0 and 1");
  }

  const { plateBBox } = obs;
  if (plateBBox !== undefined && plateBBox !== null) {
    for (const k of ["x1", "y1", "x2", "y2"]) {
      if (typeof plateBBox[k] !== "number") {
        throw new ApiError(400, `observation.plateBBox.${k} must be a number`);
      }
    }
    if (plateBBox.x1 >= plateBBox.x2 || plateBBox.y1 >= plateBBox.y2) {
      throw new ApiError(400, "observation.plateBBox must satisfy x1<x2 and y1<y2");
    }
  }
  if (
    obs.streamSessionId !== undefined &&
    obs.streamSessionId !== null &&
    (typeof obs.streamSessionId !== "string" || obs.streamSessionId.length < 1 || obs.streamSessionId.length > 64)
  ) {
    throw new ApiError(400, "observation.streamSessionId must be a non-empty string up to 64 characters");
  }
  if (
    obs.vehicleType !== undefined &&
    obs.vehicleType !== null &&
    !["BICYCLE", "CAR", "MOTORCYCLE", "BUS", "TRUCK", "VEHICLE"].includes(String(obs.vehicleType).toUpperCase())
  ) {
    throw new ApiError(400, "Invalid observation.vehicleType");
  }

  return obs;
};

// Entry point: accepts a batch of confirmed plate observations, validates the
// camera and each observation, dedupes by observationId, creates a PLATE_DETECTED
// INFO event plus an entry in the plates table. Emits event:new only — never
// alert:new, and never sets any risk on the event.
const ingestAnprObservations = async ({ schemaVersion, cameraCode, observations }) => {
  if (schemaVersion !== 1) {
    throw new ApiError(400, "Unsupported schemaVersion");
  }
  assertRequired(cameraCode, "cameraCode is required");
  assertRequired(observations, "observations is required");
  if (!Array.isArray(observations)) {
    throw new ApiError(400, "observations must be an array");
  }
  if (observations.length === 0) {
    return { eventsCreated: 0, platesCreated: 0 };
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera) {
    throw new ApiError(404, "Camera not found");
  }
  if (!camera.enabled) {
    throw new ApiError(400, "Camera is disabled");
  }

  let eventsCreated = 0;
  let eventsUpdated = 0;
  let platesCreated = 0;
  const events = [];

  for (const obs of observations) {
    validateAnprObservation(obs);
    const normalizedPlateText = String(obs.plateText).toUpperCase();

    const observationId = String(obs.observationId);
    const existing =
      observationId != null
        ? await eventRepository.findByObservationId(camera.id, observationId)
        : null;
    if (existing) {
      // Duplicate request — skip re-insertion (idempotency by observationId).
      events.push({
        observationId,
        eventId: existing.event_code,
        incidentAttached: Boolean(existing.context?.incidentBased),
      });
      continue;
    }

    // A plate confirmed after restricted-zone entry belongs to the intrusion
    // event already created for this camera/session/track. Do not create a
    // second PLATE_DETECTED event for the same incident.
    const incidentKey = incidentKeyFor(camera.id, obs);
    const incidentConn = await eventRepository.beginTransaction();
    let incident = null;
    let linkedAlert = null;
    try {
      await incidentConn.execute("SELECT id FROM cameras WHERE id = ? FOR UPDATE", [camera.id]);
      incident = await eventRepository.findIncidentByKey(
        camera.id, incidentKey, incidentConn, { forUpdate: true }
      );
      if (incident) {
        const prior = incident.context || {};
        const anprObservationIds = [...(prior.anprObservationIds || [])];
        if (!anprObservationIds.includes(observationId)) anprObservationIds.push(observationId);
        const context = {
          ...prior,
          vehiclePlate: normalizedPlateText,
          plateText: normalizedPlateText,
          vehicleTrackId: obs.vehicleTrackId,
          vehicleType: obs.vehicleType ? String(obs.vehicleType).toUpperCase() : prior.vehicleType || null,
          ocrConfidence: obs.ocrConfidence ?? null,
          plateDetectionConfidence: obs.plateDetectionConfidence ?? null,
          plateBBox: obs.plateBBox || null,
          anprObservationIds: anprObservationIds.slice(-MAX_INCIDENT_TIMELINE_ENTRIES),
          anpr: {
            source: ANPR_SOURCE,
            observationId,
            plateText: normalizedPlateText,
            rawText: obs.rawText || null,
            ocrConfidence: obs.ocrConfidence ?? null,
            plateDetectionConfidence: obs.plateDetectionConfidence ?? null,
            capturedAt: new Date(obs.occurredAt).toISOString(),
            cropQuality: obs.cropQuality || null,
            acceptanceMethod: obs.acceptanceMethod || null,
            confirmationReads: obs.confirmationReads ?? null,
          },
          timeline: [...(prior.timeline || []), {
            type: "ANPR_CONFIRMED",
            event: `Vehicle number confirmed: ${normalizedPlateText}`,
            time: new Date(obs.occurredAt).toISOString(),
            vehiclePlate: normalizedPlateText,
          }].slice(-MAX_INCIDENT_TIMELINE_ENTRIES),
        };
        incident = await eventRepository.updateIncidentContext({ id: incident.id, context, conn: incidentConn });
        const occurredAt = new Date(obs.occurredAt).toISOString().slice(0, 19).replace("T", " ");
        const plateResult = await plateRepository.upsertForEvent({
          plateEventCode: incident.event_code,
          eventId: incident.id,
          cameraId: camera.id,
          vehicleTrackId: obs.vehicleTrackId,
          plateText: normalizedPlateText,
          ocrConfidence: obs.ocrConfidence ?? null,
          vehicleType: obs.vehicleType ? String(obs.vehicleType).toUpperCase() : null,
          capturedAt: occurredAt,
        }, incidentConn);
        platesCreated += Number(plateResult.created);
        linkedAlert = await alertRepository.attachVehiclePlateByEventId({
          eventId: incident.id,
          plateText: normalizedPlateText,
          ocrConfidence: obs.ocrConfidence ?? null,
          vehicleType: obs.vehicleType ? String(obs.vehicleType).toUpperCase() : null,
          conn: incidentConn,
        });
        await eventRepository.commit(incidentConn);
      } else {
        await eventRepository.commit(incidentConn);
      }
    } catch (err) {
      await eventRepository.rollback(incidentConn);
      throw err;
    } finally {
      await eventRepository.release(incidentConn);
    }
    if (incident) {
      eventsUpdated += 1;
      realtimeService.emitEventUpdated(incident);
      if (linkedAlert) realtimeService.emitAlertUpdated(linkedAlert);
      events.push({ observationId, eventId: incident.event_code, incidentAttached: true });
      continue;
    }

    const existingTrackEvent = obs.streamSessionId
      ? await eventRepository.findDetectionBySessionTrack(
          camera.id,
          obs.streamSessionId,
          obs.vehicleTrackId,
          "PLATE_DETECTED"
        )
      : null;
    if (existingTrackEvent) {
      events.push({ observationId, eventId: existingTrackEvent.event_code, incidentAttached: false });
      continue;
    }

    // PLATE_DETECTED is observational and carries NO risk / alert meaning.
    const eventCode = crypto.randomUUID();
    const context = {
      source: ANPR_SOURCE,
      observationId,
      vehicleTrackId: obs.vehicleTrackId,
      plateText: obs.plateText,
      rawText: obs.rawText || null,
      streamSessionId: obs.streamSessionId || null,
      vehicleType: obs.vehicleType ? String(obs.vehicleType).toUpperCase() : null,
    };
    if (obs.sourceTimestampMs !== undefined && obs.sourceTimestampMs !== null) {
      context.sourceTimestampMs = obs.sourceTimestampMs;
    }
    if (obs.ocrConfidence !== undefined && obs.ocrConfidence !== null) {
      context.ocrConfidence = obs.ocrConfidence;
    }
    if (obs.plateDetectionConfidence !== undefined && obs.plateDetectionConfidence !== null) {
      context.plateDetectionConfidence = obs.plateDetectionConfidence;
    }
    if (obs.plateBBox) {
      context.plateBBox = obs.plateBBox;
    }
    for (const key of ["cropQuality", "validationResult", "preprocessingVariant", "acceptanceMethod", "confirmationReads", "vehicleBBox"]) {
      if (obs[key] !== undefined) context[key] = obs[key];
    }

    context.plateText = normalizedPlateText;
    const occurredAt = new Date(obs.occurredAt).toISOString().slice(0, 19).replace("T", " ");
    const conn = await eventRepository.beginTransaction();
    let event;
    try {
      event = await eventRepository.create({
        eventCode,
        cameraId: camera.id,
        eventType: "PLATE_DETECTED",
        objectType: "VEHICLE",
        trackId: obs.vehicleTrackId,
        confidence: obs.plateDetectionConfidence ?? null,
        riskScore: null,
        severity: "INFO",
        status: "NEW",
        context,
        occurredAt,
      }, conn);

      if (event.wasCreated === false) {
        await eventRepository.commit(conn);
        events.push({ observationId, eventId: event.event_code });
        continue;
      }

      await plateRepository.create({
        plateEventCode: event.event_code,
        eventId: event.id,
        cameraId: camera.id,
        vehicleTrackId: obs.vehicleTrackId,
        plateText: normalizedPlateText,
        ocrConfidence: obs.ocrConfidence ?? null,
        vehicleType: obs.vehicleType ? String(obs.vehicleType).toUpperCase() : null,
        capturedAt: occurredAt,
      }, conn);
      await eventRepository.commit(conn);
    } catch (err) {
      await eventRepository.rollback(conn);
      throw err;
    } finally {
      await eventRepository.release(conn);
    }

    realtimeService.emitEventNew(event);
    eventsCreated += 1;
    platesCreated += 1;
    events.push({ observationId, eventId: event.event_code, incidentAttached: false });
  }

  return { eventsCreated, eventsUpdated, platesCreated, events };
};

module.exports = { ingestAnprObservations, validateAnprObservation, ANPR_SOURCE };
