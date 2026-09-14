import test from "node:test";
import assert from "node:assert/strict";
import { geographicPoint, geographicBoundary, mapCameraForMap, mapAlertForMap, mapZoneForMap, reconcileMapData, applyMapAlert, applyMapCamera } from "../utils/mapData.mjs";

const base = () => reconcileMapData({
  cameras: [mapCameraForMap({ cameraCode: "CAM-A", id: 7, name: "Camera", latitude: 30, longitude: 80, sector: "North", streamStatus: "ONLINE" })],
  alerts: [], zones: [], fences: [], sectors: [],
});

test("missing/invalid coordinates never become 0,0; an explicitly configured 0,0 is valid", () => {
  for (const lat of [null, undefined, "", " ", false, true, {}, [], "Infinity", 91]) assert.deepEqual(geographicPoint({ lat, lng: 0 }), { lat: null, lng: null });
  assert.deepEqual(geographicPoint({ lat: "0", lng: 0 }), { lat: 0, lng: 0 });
  assert.deepEqual(geographicPoint({ latitude: -90, longitude: -180 }), { lat: -90, lng: -180 });
});

test("camera-frame zones are never rendered as geographic polygons", () => {
  assert.equal(geographicBoundary({ coordinates: [[0.1, 0.2], [0.5, 0.6]] }), null);
  assert.deepEqual(geographicBoundary({ geoCoordinates: [[30, 80], [31, 81]] }), [[30, 80], [31, 81]]);
  assert.equal(geographicBoundary({ geoCoordinates: [[30, 80], [null, 81]] }), null);
});

test("REST alerts inherit only their own configured camera's location and activate camera filter", () => {
  const data = base();
  data.alerts = [mapAlertForMap({ alert_code: "ALT-A", camera_id: 7, status: "NEW", severity: "HIGH" })];
  data.zones = [mapZoneForMap({ zone_code: "ZONE-A", camera_id: 7 })];
  data.fences = [mapZoneForMap({ zone_code: "FENCE-A", camera_id: 7 })];
  const result = reconcileMapData(data);
  assert.equal(result.cameras[0].activeAlert.id, "ALT-A");
  assert.deepEqual([result.alerts[0].lat, result.alerts[0].lng, result.alerts[0].cameraId], [30, 80, "CAM-A"]);
  assert.equal(result.zones[0].sector, "North");
  assert.equal(result.fences[0].sector, "North");
});

test("socket new, escalation, replay and acknowledgement preserve one accurate marker", () => {
  const raw = { alertCode: "ALT-A", cameraCode: "CAM-A", status: "NEW", severity: "MEDIUM", alertType: "LOITERING", createdAt: "2026-01-01T00:00:00Z", lat: null, lng: null };
  let result = applyMapAlert(base(), raw);
  assert.equal(result.alerts[0].lat, 30);
  result = applyMapAlert(result, { ...raw, severity: "HIGH" });
  result = applyMapAlert(result, { ...raw, severity: "HIGH" });
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].type, "LOITERING");
  assert.equal(result.cameras[0].activeAlert.severity, "HIGH");
  result = applyMapAlert(result, { alertCode: "ALT-A", status: "ACKNOWLEDGED" });
  assert.equal(result.alerts.length, 0);
  assert.equal(result.cameras[0].activeAlert, null);
});

test("unmapped alert remains selectable without fabricated marker, and camera updates move inherited alerts", () => {
  const unknown = applyMapAlert(base(), { alertCode: "ALT-B", cameraCode: "CAM-B", status: "NEW", severity: "HIGH" });
  assert.equal(unknown.alerts[0].lat, null);
  assert.equal(unknown.cameras[0].activeAlert, null);
  const located = applyMapAlert(base(), { alertCode: "ALT-A", cameraCode: "CAM-A", status: "NEW", severity: "HIGH" });
  const moved = applyMapCamera(located, { cameraCode: "CAM-A", latitude: 31, longitude: 81, streamStatus: "RECONNECTING" });
  assert.equal(moved.alerts[0].lat, 31);
  assert.equal(moved.cameras[0].status, "reconnecting");
  assert.strictEqual(applyMapCamera(moved, { cameraCode: "CAM-A", streamStatus: "RECONNECTING" }), moved);
  assert.equal(applyMapCamera(moved, { cameraCode: "CAM-A", latitude: null, longitude: null }).alerts[0].lat, null);
});

test("explicit alert locations stay independent of camera coordinates and severity ordering is deterministic", () => {
  let result = applyMapAlert(base(), { alertCode: "LOW", cameraCode: "CAM-A", status: "NEW", severity: "LOW", latitude: 10, longitude: 20 });
  result = applyMapAlert(result, { alertCode: "CRIT", cameraCode: "CAM-A", status: "NEW", severity: "CRITICAL" });
  result = applyMapCamera(result, { cameraCode: "CAM-A", latitude: 32, longitude: 82 });
  assert.equal(result.alerts[0].id, "CRIT");
  assert.equal(result.alerts.find((a) => a.id === "LOW").lat, 10);
});
