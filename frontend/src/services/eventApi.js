import request from "./api";

// GET /api/events  (supports search & filters)
export function getEvents(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
  return request(`/api/events${qs ? `?${qs}` : ""}`);
}

// GET /api/events/:id
export function getEventById(id) {
  return request(`/api/events/${id}`);
}

// GET /api/events/:id/related
export function getRelatedEvents(id) {
  return request(`/api/events/${id}/related`);
}

// GET /api/cameras/:id/events
export function getCameraEvents(cameraId) {
  return request(`/api/cameras/${cameraId}/events`);
}
