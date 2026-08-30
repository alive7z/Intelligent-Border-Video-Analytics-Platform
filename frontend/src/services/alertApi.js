import request from "./api";

// GET /api/alerts
// Supported query params: severity, status, camera, eventType, search
export function getAlerts(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return request(`/api/alerts${qs ? `?${qs}` : ""}`);
}

// GET /api/alerts/:id
export function getAlertById(id) {
  return request(`/api/alerts/${id}`);
}

// POST /api/alerts/:id/ack
// data: { operator, notes }
export function acknowledgeAlert(id, data = {}) {
  return request(`/api/alerts/${id}/ack`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// POST /api/alerts/:id/resolve
// data: { type, notes }
export function resolveAlert(id, data = {}) {
  return request(`/api/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
