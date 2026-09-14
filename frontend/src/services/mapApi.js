import request from "./api";
import { mapCameraForMap, mapAlertForMap, mapZoneForMap, reconcileMapData } from "../utils/mapData.mjs";

async function getAllItems(path) {
  const first = await request(`${path}?page=1&limit=100`);
  const totalPages = Number(first.data?.pagination?.totalPages || 0);
  const remaining = totalPages > 1
    ? await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        request(`${path}?page=${index + 2}&limit=100`)
      )
    )
    : [];
  return [first, ...remaining].flatMap((response) => response.data?.items || []);
}

// Map datasets reuse the shared domain endpoints (the backend has no dedicated
// /api/map route). Only explicitly geographic fields are accepted here. The
// ordinary zone `coordinates` field is deliberately ignored because it is a
// normalized CCTV-frame boundary, not latitude/longitude.
// GET /api/cameras (reused for the map marker layer)
export async function getMapCameras() {
  const items = await getAllItems("/api/cameras");
  return {
    success: true,
    data: items.map(mapCameraForMap),
  };
}

// GET /api/alerts (reused for the map alert layer)
export async function getMapAlerts() {
  const items = await getAllItems("/api/alerts");
  return {
    success: true,
    data: items
      .filter((alert) => ["NEW", "ACTIVE"].includes(String(alert.status || "").toUpperCase()))
      .map(mapAlertForMap),
  };
}

// GET /api/zones  (polygon restricted zones)
export async function getZones() {
  const items = await getAllItems("/api/zones");
  return {
    success: true,
    data: items
      .filter((zone) => zone.zone_type !== "VIRTUAL_FENCE")
      .map(mapZoneForMap),
  };
}

// Virtual fences share /api/zones. They render only when an explicit geographic
// boundary exists; normalized camera-frame points never reach Leaflet.
export async function getVirtualFences() {
  const items = await getAllItems("/api/zones");
  return {
    success: true,
    data: items
      .filter((zone) => zone.zone_type === "VIRTUAL_FENCE")
      .map(mapZoneForMap),
  };
}

// No sectors endpoint exists; honest empty set.
export function getMapSectors() {
  return Promise.resolve({ success: true, data: [] });
}

// Convenience: fetch everything the map needs in one shot (resolves to the raw
// bundle the BorderMap consumes directly). Each dataset is normalized into an
// array so the page never has to guess; a failure in one dataset stays isolated
// rather than blanking the whole map.
export async function getBorderMapData() {
  const settled = await Promise.allSettled([
    getMapCameras(),
    getMapAlerts(),
    getAllItems("/api/zones"),
    getMapSectors(),
  ]);
  const pick = (i, fallback) => (settled[i].status === "fulfilled" ? settled[i].value.data : fallback);
  if (settled.slice(0, 3).every((result) => result.status === "rejected")) {
    throw new Error("Unable to load geographic map data");
  }
  const boundaries = settled[2].status === "fulfilled" ? settled[2].value : [];
  return reconcileMapData({
    cameras: pick(0, []),
    alerts: pick(1, []),
    zones: boundaries.filter((zone) => zone.zone_type !== "VIRTUAL_FENCE").map(mapZoneForMap),
    fences: boundaries.filter((zone) => zone.zone_type === "VIRTUAL_FENCE").map(mapZoneForMap),
    sectors: pick(3, []),
  });
}
