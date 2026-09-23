import request, { buildUrl } from "./api";
import {
  normalizeLiveStatus,
  liveRuntimeStatus,
  databaseStatus,
  mergeRuntimeCamera,
  fromSocketCamera,
} from "../utils/cameraStatus";

// Status/mapping helpers live in utils/cameraStatus.js (dependency-free and
// unit-tested directly). Re-exported here so existing cameraApi consumers keep
// their current import sites.
export {
  normalizeLiveStatus,
  liveRuntimeStatus,
  databaseStatus,
  mergeRuntimeCamera,
  fromSocketCamera,
};

// Single mapper: backend camera (canonical camelCase app shape) -> the shape
// the UI components expect. Honest values only — the "Mobile Demo Camera"
// (NOT_CONFIGURED) maps to offline, not fabricated online.
function mapCamera(c) {
  if (!c) return null;
  const status = c.streamStatus === "ONLINE" ? "online" : "offline";
  return {
    id: c.cameraCode,
    // Numeric DB id preserved for admin operations (camera assignment etc.).
    objectId: c.id ?? null,
    cameraCode: c.cameraCode,
    name: c.name,
    location: c.locationName || c.name,
    locationName: c.locationName || null,
    sector: c.sector || null,
    description: c.description || null,
    status,
    streamStatus: c.streamStatus,
    aiStatus: c.aiStatus,
    sourceType: c.sourceType,
    streamProtocol: c.streamProtocol,
    rotationDegrees: Number(c.rotationDegrees || 0),
    displayRotationDegrees: Number(c.displayRotationDegrees || 0),
    enabled: Boolean(c.enabled),
    lastSeen: c.lastSeenAt || null,
    lastUpdate: c.lastSeenAt || null,
    // Display-only fields with no backend source (kept falsy, never fabricated).
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

function mapCameraEvents(items) {
  return (items || []).map((e) => ({
    id: e.event_code || e.id,
    time: e.occurred_at || e.created_at,
    type: e.event_type,
    severity: e.severity,
    status: e.status,
    objectType: e.object_type || null,
    trackId: e.track_id != null ? String(e.track_id) : null,
    riskScore: e.risk_score != null ? Number(e.risk_score) : null,
  }));
}

// GET /api/cameras  -> { data: [camera, ...], pagination }
export function getCameras(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return request(`/api/cameras${qs ? `?${qs}` : ""}`).then((res) => ({
    ...res,
    data: (res.data?.items || []).map(mapCamera),
    pagination: res.data?.pagination || {},
  }));
}

// Fetch every authorized camera while respecting the backend's 100-row page
// ceiling. Operators still receive only their assigned cameras because that
// scope is enforced by the server on every page.
export async function getAllCameras(params = {}) {
  const pageSize = 100;
  const first = await getCameras({ ...params, page: 1, limit: pageSize });
  const totalPages = Number(first.pagination?.totalPages || 0);
  if (totalPages <= 1) return first;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getCameras({ ...params, page: index + 2, limit: pageSize })
    )
  );
  return {
    ...first,
    data: [first, ...remaining].flatMap((response) => response.data || []),
    pagination: {
      ...first.pagination,
      page: 1,
      limit: pageSize,
    },
  };
}

// GET /api/cameras/:cameraCode
export function getCameraById(id) {
  return request(`/api/cameras/${id}`).then((res) => ({
    ...res,
    data: mapCamera(res.data?.camera ?? res.data),
  }));
}

// GET /api/cameras/:cameraId/runtime-status — live runtime (Redis or Python
// fallback). Returns the raw `data.camera` payload or null.
export async function getCameraRuntimeStatus(id) {
  const res = await request(`/api/cameras/${encodeURIComponent(id)}/runtime-status`);
  return res?.data?.camera || null;
}

// Backend exposes no /cameras/:id/events route; reuse the events list filtered
// by camera_code and map into the compact shape CameraDetails expects.
export function getCameraEvents(id) {
  return request(`/api/events?cameraId=${encodeURIComponent(id)}`).then(
    (res) => ({
      ...res,
      data: mapCameraEvents(res.data?.items || []),
    })
  );
}

// No per-camera health endpoint in the backend; resolves to null payload.
export function getCameraHealth() {
  return Promise.resolve({ success: true, data: null });
}

// GET /api/health  (system health)
export function getSystemHealth() {
  return request("/api/health");
}

export function getSystemStatus() {
  return request("/api/system/status");
}

// Phase 13 — short-lived browser-compatible live preview URL (backend proxies the
// Python MJPEG stream; the browser never receives raw RTSP or credentials).
export async function getCameraPreviewUrl(id) {
  const res = await request(`/api/cameras/${encodeURIComponent(id)}/preview-token`);
  const previewUrl = res?.data?.previewUrl;
  if (!previewUrl) return null;
  return buildUrl(previewUrl);
}

// Batch runtime-status for each enabled camera (one lightweight call per camera,
// resolved concurrently). Returns a map cameraCode -> safe runtime payload.
// Callers collapse this into a single page-level sync; never per-render.
export async function fetchRuntimeMap(cameras = []) {
  const enabled = cameras.filter((c) => c.enabled);
  const results = await Promise.all(
    enabled.map(async (c) => ({
      id: c.id,
      raw: await getCameraRuntimeStatus(c.id).catch(() => null),
    }))
  );
  const map = {};
  results.forEach(({ id, raw }) => {
    if (raw) map[id] = raw;
  });
  return map;
}

// Adapter for realtime socket camera payloads (camelCase from the server
// serializer) -> the view shape the components use. Defined in utils/cameraStatus.js.
