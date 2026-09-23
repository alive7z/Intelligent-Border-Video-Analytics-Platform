// Pure camera runtime-status resolution, shared by the camera REST/socket mappers.
// Kept dependency-free so Node can unit-test it directly (frontend "services/"
// modules import with extensionless Vite paths that the browser bundler expands).

// Normalize backend status tokens (DB stream_status / Redis runtime.status) to
// the lowercase UI states the components render. Token-level only — real
// ONLINE/CONNECTING assertions always come from the runtime payload, subject to
// liveRuntimeStatus()/databaseStatus() below.
export function normalizeLiveStatus(raw) {
  switch ((raw || "").toUpperCase()) {
    case "ONLINE":
      return "online";
    case "CONNECTING":
      return "connecting";
    case "DEGRADED":
      return "degraded";
    case "RECONNECTING":
      return "reconnecting";
    case "OFFLINE":
      return "offline";
    case "ERROR":
      return "error";
    case "NOT_CONFIGURED":
      return "offline";
    default:
      return "offline";
  }
}

// Canonical UI status from a live runtime payload. The backend/AI is the only
// authority for whether a stream is actively connected. CONNECTING is a real,
// transient connection attempt; RECONNECTING means the camera is between retries
// and surfaces as OFFLINE so a camera is never stuck on a connecting badge while
// no stream is being opened.
export function liveRuntimeStatus(raw) {
  switch (String(raw || "").toUpperCase()) {
    case "ONLINE":
      return "online";
    case "CONNECTING":
      return "connecting";
    case "DEGRADED":
      return "degraded";
    default:
      // OFFLINE / ERROR / EOF / STOPPED / NOT_CONFIGURED / RECONNECTING / UNKNOWN
      return "offline";
  }
}

// Status derived purely from the recorded DB row. The DB never confirms a live
// connection attempt, so only an explicitly recorded ONLINE is honored; a stale
// CONNECTING/RECONNECTING row must not outrank a missing or failed runtime.
export function databaseStatus(raw, enabled) {
  if (enabled === false) return "offline";
  return String(raw || "").toUpperCase() === "ONLINE" ? "online" : "offline";
}

// Merge a runtime-status payload onto an already-mapped camera. Runtime is the
// canonical backend live state when present (Redis or the Python fallback); the
// static DB row only resolves to ONLINE when there is no runtime at all. A stale
// CONNECTING row is never treated as a live connection — cameras with no active
// source always render OFFLINE.
export function mergeRuntimeCamera(base, raw) {
  if (!raw) return base;
  const c = raw.camera || raw;
  const live = Boolean(c.live);
  const runtime = c.runtime || null;
  const runtimeStatus = runtime?.status || null;

  const status =
    c.enabled === false
      ? "offline"
      : runtimeStatus
        ? liveRuntimeStatus(runtimeStatus)
        : databaseStatus(c.streamStatus, c.enabled);

  return {
    ...base,
    id: c.cameraCode || base.id,
    cameraCode: c.cameraCode || base.cameraCode,
    name: c.name || base.name,
    locationName: c.locationName || base.locationName,
    location: c.locationName || base.locationName || base.name,
    sector: c.sector || base.sector,
    status,
    streamStatus: runtimeStatus || c.streamStatus,
    aiStatus: c.aiStatus || base.aiStatus,
    sourceType: c.sourceType || base.sourceType,
    streamProtocol: c.streamProtocol || base.streamProtocol,
    enabled: c.enabled !== undefined ? Boolean(c.enabled) : base.enabled,
    lastSeen: runtime?.lastFrameAt || c.lastSeenAt || base.lastSeen,
    framesProcessed: runtime?.framesProcessed ?? base.framesProcessed,
    reconnectAttempts: runtime?.reconnectAttempts ?? 0,
    live,
    runtime,
  };
}

// Adapter for realtime socket camera payloads (camelCase from the server
// serializer) -> the view shape the components use.
export function fromSocketCamera(p) {
  if (!p) return null;
  return {
    id: p.cameraCode,
    cameraCode: p.cameraCode,
    name: p.name,
    location: p.locationName || p.name,
    locationName: p.locationName || null,
    sector: p.sector || null,
    description: null,
    status: databaseStatus(p.streamStatus, p.enabled),
    streamStatus: p.streamStatus,
    aiStatus: p.aiStatus,
    sourceType: p.sourceType,
    streamProtocol: p.streamProtocol,
    rotationDegrees: Number(p.rotationDegrees || 0),
    displayRotationDegrees: Number(p.displayRotationDegrees || 0),
    enabled: Boolean(p.enabled),
    lastSeen: p.lastSeenAt || null,
    lastUpdate: p.lastSeenAt || null,
    fps: null,
    latency: null,
    detections: [],
    activeAlert: null,
    context: null,
    risk: null,
    severity: null,
    lat: null,
    lng: null,
  };
}