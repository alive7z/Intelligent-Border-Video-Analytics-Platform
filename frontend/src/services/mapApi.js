import request from "./api";

// Map-specific endpoints. Camera and alert records are reused from the shared
// cameraApi / alertApi datasets where practical; the map endpoints simply
// return the same data in one call for convenience.

// GET /api/map/cameras
export function getMapCameras() {
  return request("/api/map/cameras");
}

// GET /api/map/alerts
export function getMapAlerts() {
  return request("/api/map/alerts");
}

// GET /api/map/zones  (polygon restricted zones; distinct from the admin /api/zones)
export function getZones() {
  return request("/api/map/zones");
}

// GET /api/map/virtual-fences
export function getVirtualFences() {
  return request("/api/map/virtual-fences");
}

// GET /api/map/sectors
export function getMapSectors() {
  return request("/api/map/sectors");
}

// Convenience: fetch everything the map needs in one shot.
export function getBorderMapData() {
  return Promise.all([
    getMapCameras(),
    getMapAlerts(),
    getZones(),
    getVirtualFences(),
    getMapSectors(),
  ]).then(([cameras, alerts, zones, fences, sectors]) => ({
    cameras: cameras.data,
    alerts: alerts.data,
    zones: zones.data,
    fences: fences.data,
    sectors: sectors.data,
  }));
}
