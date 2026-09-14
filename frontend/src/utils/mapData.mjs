// Shared REST/socket normalization. Only explicit geographic coordinates are
// accepted; image-frame zone boundaries must never become map locations.
const coordinate = (value, limit) => {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
};

export function geographicPoint(record) {
  const lat = coordinate(record?.latitude ?? record?.lat ?? record?.geo_latitude ?? record?.geoLatitude, 90);
  const lng = coordinate(record?.longitude ?? record?.lng ?? record?.geo_longitude ?? record?.geoLongitude, 180);
  return lat === null || lng === null ? { lat: null, lng: null } : { lat, lng };
}

export function geographicBoundary(record) {
  const raw = record?.geographic_coordinates ?? record?.geoCoordinates;
  if (!Array.isArray(raw)) return null;
  const points = raw.map((point) => geographicPoint(Array.isArray(point) ? { lat: point[0], lng: point[1] } : point));
  return points.length && points.every((point) => point.lat !== null)
    ? points.map(({ lat, lng }) => [lat, lng]) : null;
}

export function mapCameraForMap(c) {
  return {
    id: c.cameraCode ?? c.camera_code ?? c.id,
    objectId: c.id,
    name: c.name,
    location: c.locationName || c.name,
    sector: c.sector || null,
    status: String(c.streamStatus ?? c.status ?? "offline").toLowerCase(),
    risk: null,
    severity: null,
    activeAlert: null,
    lastUpdate: c.lastSeenAt || null,
    lastSeen: c.lastSeenAt || null,
    detections: null,
    ...geographicPoint(c),
  };
}

export function mapAlertForMap(a) {
  return {
    id: a.alertCode ?? a.alert_code ?? a.id,
    type: a.alertType ?? a.alert_type ?? a.type,
    severity: a.severity,
    status: a.status,
    riskScore: a.riskScore ?? a.risk_score ?? null,
    cameraId: a.cameraCode ?? a.camera_code ?? a.cameraId ?? a.camera_id,
    sector: a.sector || null,
    timestamp: a.createdAt ?? a.created_at ?? a.timestamp ?? null,
    ...geographicPoint(a),
  };
}

export function mapZoneForMap(z) {
  return {
    id: z.zoneCode ?? z.zone_code ?? z.id,
    name: z.name,
    type: z.zoneType ?? z.zone_type,
    cameraId: z.cameraCode ?? z.camera_code ?? z.cameraId ?? z.camera_id,
    sector: z.sector || null,
    riskLevel: z.riskLevel ?? z.risk_level,
    coordinates: geographicBoundary(z),
  };
}

export const isActiveMapAlert = (alert) => ["NEW", "ACTIVE"].includes(String(alert.status || "").toUpperCase());
const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export function reconcileMapData(data) {
  const cameraFor = (id) => data.cameras.find((c) => String(c.id) === String(id) || (c.objectId != null && String(c.objectId) === String(id)));
  const alerts = data.alerts.filter(isActiveMapAlert).map((alert) => {
    const camera = cameraFor(alert.cameraId);
    const explicit = geographicPoint(alert);
    const point = explicit.lat === null || alert.locationSource === "camera" ? geographicPoint(camera) : explicit;
    return {
      ...alert, ...point,
      cameraId: camera?.id ?? alert.cameraId,
      camera: camera?.id ?? alert.cameraId,
      sector: alert.sector || camera?.sector || null,
      locationSource: explicit.lat === null || alert.locationSource === "camera" ? (point.lat === null ? null : "camera") : "alert",
    };
  }).sort((a, b) => (severityRank[String(b.severity).toUpperCase()] || 0) - (severityRank[String(a.severity).toUpperCase()] || 0) || String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  return {
    ...data,
    alerts,
    cameras: data.cameras.map((camera) => {
      const activeAlert = alerts.find((alert) => alert.cameraId === camera.id) || null;
      return { ...camera, activeAlert, risk: activeAlert?.severity || null, severity: activeAlert?.severity || null };
    }),
    zones: (data.zones || []).map((zone) => ({ ...zone, sector: zone.sector || cameraFor(zone.cameraId)?.sector || null })),
    fences: (data.fences || []).map((fence) => ({ ...fence, sector: fence.sector || cameraFor(fence.cameraId)?.sector || null })),
  };
}

export function applyMapAlert(data, raw) {
  const id = raw?.alertCode ?? raw?.alert_code ?? raw?.id;
  if (!id) return data;
  const existing = data.alerts.find((alert) => alert.id === id);
  const mapped = mapAlertForMap(raw);
  const next = existing ? { ...existing } : mapped;
  if (existing) {
    for (const field of ["type", "severity", "status", "cameraId", "timestamp", "riskScore", "sector"]) {
      if (mapped[field] != null) next[field] = mapped[field];
    }
    if (mapped.lat !== null) Object.assign(next, { lat: mapped.lat, lng: mapped.lng, locationSource: "alert" });
  }
  const remaining = data.alerts.filter((alert) => alert.id !== id);
  const alerts = !raw.deletedAt && !raw.deleted_at && isActiveMapAlert(next) ? [...remaining, next] : remaining;
  return reconcileMapData({ ...data, alerts });
}

export function applyMapCamera(data, raw) {
  const id = raw?.cameraCode ?? raw?.camera_code ?? raw?.id;
  if (!id) return data;
  let changed = false;
  const cameras = data.cameras.map((camera) => {
    if (camera.id !== id) return camera;
    const patch = {};
    for (const field of ["name", "sector"]) if (raw[field] !== undefined) patch[field] = raw[field];
    if (raw.streamStatus || raw.status) patch.status = String(raw.streamStatus || raw.status).toLowerCase();
    if (raw.lastSeenAt !== undefined) patch.lastUpdate = patch.lastSeen = raw.lastSeenAt;
    if (["latitude", "longitude", "lat", "lng", "geoLatitude", "geoLongitude"].some((field) => field in raw)) Object.assign(patch, geographicPoint(raw));
    if (Object.entries(patch).every(([field, value]) => camera[field] === value)) return camera;
    changed = true;
    return { ...camera, ...patch };
  });
  return changed ? reconcileMapData({ ...data, cameras }) : data;
}
