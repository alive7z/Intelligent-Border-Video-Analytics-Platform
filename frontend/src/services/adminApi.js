import request from "./api";

/**
 * Admin service layer. All HTTP verbs go through the shared `request` client
 * so swapping mock data for the real Node.js + Express + SQL backend later
 * only requires changing `USE_MOCK` in api.js — the endpoints map 1:1 to the
 * planned REST API contract below.
 *
 * Planned endpoints:
 *   GET/POST    /api/admin/cameras
 *   PUT         /api/admin/cameras/:id
 *   POST        /api/admin/cameras/:id/test
 *   POST        /api/admin/cameras/:id/disable
 *   GET/POST/PUT/DELETE /api/zones
 *   GET/PUT     /api/rules
 *   GET/PUT     /api/rules/thresholds
 *   GET/PUT     /api/rules/config
 *   GET/POST/PUT /api/admin/users
 *   POST        /api/admin/users/:id/deactivate
 *   GET/PUT     /api/admin/settings
 *   GET         /api/admin/roles
 *   GET         /api/admin/audit
 */

// ----- Cameras -----
export function getCameras() {
  return request("/api/admin/cameras");
}

export function createCamera(data) {
  return request("/api/admin/cameras", { method: "POST", body: JSON.stringify(data) });
}

export function updateCamera(id, data) {
  return request(`/api/admin/cameras/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function disableCamera(id) {
  return request(`/api/admin/cameras/${id}/disable`, { method: "POST" });
}

export function testCameraConnection(id) {
  return request(`/api/admin/cameras/${id}/test`, { method: "POST" });
}

// ----- Zones -----
export function getZones() {
  return request("/api/zones");
}

export function createZone(data) {
  return request("/api/zones", { method: "POST", body: JSON.stringify(data) });
}

export function updateZone(id, data) {
  return request(`/api/zones/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteZone(id) {
  return request(`/api/zones/${id}`, { method: "DELETE" });
}

// ----- Risk rules -----
export function getRiskRules() {
  return request("/api/rules");
}

export function updateRiskRule(id, data) {
  return request(`/api/rules/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function getRiskThresholds() {
  return request("/api/rules/thresholds");
}

export function updateRiskThresholds(data) {
  return request("/api/rules/thresholds", { method: "PUT", body: JSON.stringify(data) });
}

export function getRiskConfig() {
  return request("/api/rules/config");
}

export function updateRiskConfig(data) {
  return request("/api/rules/config", { method: "PUT", body: JSON.stringify(data) });
}

// ----- Users & roles -----
export function getUsers() {
  return request("/api/admin/users");
}

export function createUser(data) {
  return request("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
}

export function updateUser(id, data) {
  return request(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deactivateUser(id) {
  return request(`/api/admin/users/${id}/deactivate`, { method: "POST" });
}

export function getRolePermissions() {
  return request("/api/admin/roles");
}

// ----- Settings -----
export function getSystemSettings() {
  return request("/api/admin/settings");
}

export function updateSystemSettings(data) {
  return request("/api/admin/settings", { method: "PUT", body: JSON.stringify(data) });
}

export function getAuditLogs() {
  return request("/api/admin/audit");
}
