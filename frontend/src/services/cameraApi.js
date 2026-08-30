import request from "./api";

// GET /api/cameras
// Future query support: ?status=online&sector=North%20Sector&search=CAM-01
export function getCameras(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return request(`/api/cameras${qs ? `?${qs}` : ""}`);
}

// GET /api/cameras/:id
export function getCameraById(id) {
  return request(`/api/cameras/${id}`);
}

// GET /api/cameras/:id/events
export function getCameraEvents(id) {
  return request(`/api/cameras/${id}/events`);
}

// GET /api/cameras/:id/health
export function getCameraHealth(id) {
  return request(`/api/cameras/${id}/health`);
}

// GET /api/health  (also used by dashboard health panel)
export function getSystemHealth() {
  return request("/api/health");
}
