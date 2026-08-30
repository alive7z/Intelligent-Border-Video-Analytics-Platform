import request from "./api";

function qs(params) {
  return new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  ).toString();
}

// GET /api/intelligence/anpr (supports search/filter/pagination)
export function getANPREvents(params = {}) {
  const s = qs(params);
  return request(`/api/intelligence/anpr${s ? `?${s}` : ""}`);
}

// GET /api/intelligence/anpr/:id
export function getANPREventById(id) {
  return request(`/api/intelligence/anpr/${id}`);
}

// GET /api/intelligence/faces (supports search/filter/pagination)
export function getFaceEvents(params = {}) {
  const s = qs(params);
  return request(`/api/intelligence/faces${s ? `?${s}` : ""}`);
}

// GET /api/intelligence/faces/:id
export function getFaceEventById(id) {
  return request(`/api/intelligence/faces/${id}`);
}

// GET /api/intelligence/vehicles (supports search/filter/pagination)
export function getVehicleEvents(params = {}) {
  const s = qs(params);
  return request(`/api/intelligence/vehicles${s ? `?${s}` : ""}`);
}

// GET /api/intelligence/vehicles/:id
export function getVehicleByTrackId(id) {
  return request(`/api/intelligence/vehicles/${id}`);
}
