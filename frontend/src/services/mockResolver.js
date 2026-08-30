import { setMockResolver } from "./api";
import {
  mockSummary,
  mockCameras,
  mockAlerts,
  mockEvents,
  mockAnpr,
  mockFaces,
  mockVehicles,
  mockAlertTrend,
  mockRiskDistribution,
  mockSystemHealth,
  mockIntelligenceSummary,
  mockCamerasAdmin,
  mockZones,
  mockRiskRules,
  mockUsers,
  mockMapMarkers,
  mockEventsByType,
  mockAlertsByCamera,
  mockEventsByTime,
  mockCameraHealthStats,
  mockCameraEvents,
  mockCameraHealth,
  mockMapAlerts,
  mockMapZones,
  mockMapVirtualFences,
  mockMapSectors,
  adminCameraData,
  adminZoneData,
  adminRiskRuleData,
  adminSeverityThresholds,
  adminRiskConfig,
  adminUserData,
  adminRolePermissions,
  systemSettingsData,
  auditLogData,
} from "../data/mockData";

// Multiple demo accounts so role-based behavior can be exercised in the UI.
// (Frontend UI is not a security boundary — a real backend must enforce RBAC.)
const mockCredentialsList = [
  {
    username: "admin",
    password: "admin1234",
    user: { name: "Admin User", role: "Administrator", email: "admin@ibvap.local" },
  },
  {
    username: "operator",
    password: "op1234",
    user: { name: "Amit Verma", role: "Security Operator", email: "amit.verma@ibvap.gov.in" },
  },
  {
    username: "analyst",
    password: "analyst1234",
    user: { name: "Analyst 01", role: "Auditor / Analyst", email: "analyst01@ibvap.local" },
  },
];

function matches(query, keys = []) {
  if (!query) return true;
  const q = String(query).toLowerCase();
  return keys.some((k) => {
    const v = String(k).toLowerCase();
    return !q || v.includes(q);
  });
}

function filterByDate(list, date) {
  const now = new Date();
  if (date === "today") return list.filter((e) => new Date(e.timestamp).toDateString() === now.toDateString());
  if (date === "24h") return list.filter((e) => now - new Date(e.timestamp) <= 24 * 60 * 60 * 1000);
  if (date === "7d") return list.filter((e) => now - new Date(e.timestamp) <= 7 * 24 * 60 * 60 * 1000);
  return list;
}

const handlers = {
  "/api/summary": () => ({ data: mockSummary }),

  "/api/cameras": (url, options) => {
    const match = url.match(/\/api\/cameras\/([^/?]+)(?:\/([a-z]+))?/);
    const id = match?.[1];
    const sub = match?.[2];

    if (id) {
      const cam = mockCameras.find((c) => c.id === id) ?? null;
      if (sub === "events") {
        return { data: mockCameraEvents[id] ?? [] };
      }
      if (sub === "health") {
        return { data: mockCameraHealth[id] ?? null };
      }
      return { data: cam };
    }
    return { data: mockCameras };
  },

  "/api/alerts": (url, options) => {
    const parsed = new URL("http://x" + url);
    const severity = parsed.searchParams.get("severity");
    const status = parsed.searchParams.get("status");
    const camera = parsed.searchParams.get("camera");
    const eventType = parsed.searchParams.get("eventType");
    let list = mockAlerts;
    if (severity) list = list.filter((a) => a.severity === severity);
    if (status) list = list.filter((a) => a.status.toLowerCase() === status.toLowerCase());
    if (camera) list = list.filter((a) => a.camera === camera);
    if (eventType) list = list.filter((a) => a.eventTypeKey === eventType);

    const ackId = url.match(/\/api\/alerts\/([^/]+)\/ack/)?.[1];
    if (ackId) {
      const alert = mockAlerts.find((a) => a.id === ackId);
      if (alert) {
        const body = options.body ? JSON.parse(options.body) : {};
        alert.status = "Acknowledged";
        alert.acknowledgedBy = body.operator || "Security Operator";
        alert.acknowledgedAt = new Date().toISOString();
        alert.operatorNote = body.notes || null;
      }
      return { data: alert };
    }

    const resolveId = url.match(/\/api\/alerts\/([^/]+)\/resolve/)?.[1];
    if (resolveId) {
      const alert = mockAlerts.find((a) => a.id === resolveId);
      if (alert && options.body) {
        const body = JSON.parse(options.body);
        alert.status = "Resolved";
        alert.resolution = {
          type: body.type || "No Further Action",
          notes: body.notes || "",
        };
      }
      return { data: alert };
    }

    const single = url.match(/\/api\/alerts\/([^?/]+)/)?.[1];
    if (single) {
      return { data: list.find((a) => a.id === single) ?? null };
    }
    return { data: list };
  },

  "/api/events": (url, options) => {
    const parsed = new URL("http://x" + url);
    const search = parsed.searchParams.get("search");
    const type = parsed.searchParams.get("type");
    const camera = parsed.searchParams.get("camera");
    const severity = parsed.searchParams.get("severity");
    const status = parsed.searchParams.get("status");
    const page = Number(parsed.searchParams.get("page") || "1");
    const pageSize = Number(parsed.searchParams.get("pageSize") || "20");

    let list = mockEvents;

    const relatedId = url.match(/\/api\/events\/([^/]+)\/related/)?.[1];
    if (relatedId) {
      const source = mockEvents.find((e) => e.id === relatedId);
      if (!source) return { data: [] };
      let related = mockEvents.filter(
        (e) =>
          e.cameraId === source.cameraId &&
          e.id !== source.id &&
          Math.abs(new Date(e.timestamp) - new Date(source.timestamp)) < 6 * 60 * 1000
      );
      if (related.length === 0) related = mockEvents.filter((e) => e.id !== source.id).slice(0, 3);
      return { data: related };
    }

    const single = url.match(/\/api\/events\/([^?/]+)/)?.[1];
    if (single) return { data: mockEvents.find((e) => e.id === single) ?? null };

    const date = parsed.searchParams.get("date");
    const now = new Date();
    if (search) list = list.filter((e) => matches(search, [e.id, e.camera, e.cameraName, e.objectType, e.type, e.trackId, e.anpr?.plate]));
    if (type) list = list.filter((e) => e.type === type);
    if (camera && camera !== "all") list = list.filter((e) => e.camera === camera);
    if (severity && severity !== "all") list = list.filter((e) => e.severity === severity);
    if (status && status !== "all") list = list.filter((e) => e.status.toLowerCase() === status.toLowerCase());
    if (date === "today") list = list.filter((e) => new Date(e.timestamp).toDateString() === now.toDateString());
    else if (date === "24h") list = list.filter((e) => now - new Date(e.timestamp) <= 24 * 60 * 60 * 1000);
    else if (date === "7d") list = list.filter((e) => now - new Date(e.timestamp) <= 7 * 24 * 60 * 60 * 1000);

    list = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const total = list.length;
    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize);
    return { data: paged, meta: { total, page, pageSize } };
  },

  "/api/intelligence/anpr": (url) => {
    const parsed = new URL("http://x" + url);
    const id = url.match(/\/api\/intelligence\/anpr\/([^?/]+)/)?.[1];
    if (id) return { data: mockAnpr.find((a) => a.id === id) ?? null };

    let list = mockAnpr;
    const search = parsed.searchParams.get("search");
    const camera = parsed.searchParams.get("camera");
    const vehicleType = parsed.searchParams.get("vehicleType");
    const quality = parsed.searchParams.get("confidence");
    const date = parsed.searchParams.get("date");
    const page = Number(parsed.searchParams.get("page") || "1");
    const pageSize = Number(parsed.searchParams.get("pageSize") || "10");

    if (search) list = list.filter((a) => matches(search, [a.plateNumber, a.cameraId, a.cameraName, a.location, a.vehicleTrackId, a.id]));
    if (camera) list = list.filter((a) => a.cameraId === camera);
    if (vehicleType) list = list.filter((a) => a.vehicleType.toLowerCase() === vehicleType.toLowerCase());
    if (quality) {
      const q = String(quality).toLowerCase();
      list = list.filter((a) => {
        const pct = Math.round(a.confidence * 100);
        const cat = pct >= 90 ? "high" : pct >= 75 ? "medium" : "low";
        return cat === q;
      });
    }
    if (date) list = filterByDate(list, date);

    list = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const total = list.length;
    const start = (page - 1) * pageSize;
    return { data: list.slice(start, start + pageSize), meta: { total, page, pageSize } };
  },

  "/api/intelligence/faces": (url) => {
    const parsed = new URL("http://x" + url);
    const id = url.match(/\/api\/intelligence\/faces\/([^?/]+)/)?.[1];
    if (id) return { data: mockFaces.find((f) => f.id === id) ?? null };

    let list = mockFaces;
    const search = parsed.searchParams.get("search");
    const camera = parsed.searchParams.get("camera");
    const date = parsed.searchParams.get("date");
    const sector = parsed.searchParams.get("sector");
    const page = Number(parsed.searchParams.get("page") || "1");
    const pageSize = Number(parsed.searchParams.get("pageSize") || "10");

    if (search) list = list.filter((f) => matches(search, [f.id, f.trackId, f.cameraId, f.cameraName, f.location]));
    if (camera) list = list.filter((f) => f.cameraId === camera);
    if (sector) list = list.filter((f) => f.location === sector);
    if (date) list = filterByDate(list, date);

    list = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const total = list.length;
    const start = (page - 1) * pageSize;
    return { data: list.slice(start, start + pageSize), meta: { total, page, pageSize } };
  },

  "/api/intelligence/vehicles": (url) => {
    const parsed = new URL("http://x" + url);
    const id = url.match(/\/api\/intelligence\/vehicles\/([^?/]+)/)?.[1];
    if (id) return { data: mockVehicles.find((v) => v.trackId === id) ?? null };

    let list = mockVehicles;
    const vehicleType = parsed.searchParams.get("vehicleType");
    const camera = parsed.searchParams.get("camera");
    const direction = parsed.searchParams.get("direction");
    const risk = parsed.searchParams.get("risk");
    const date = parsed.searchParams.get("date");
    const page = Number(parsed.searchParams.get("page") || "1");
    const pageSize = Number(parsed.searchParams.get("pageSize") || "10");

    if (vehicleType) list = list.filter((v) => v.vehicleType.toLowerCase() === vehicleType.toLowerCase());
    if (camera) list = list.filter((v) => v.cameraId === camera);
    if (direction) list = list.filter((v) => v.direction === direction);
    if (risk) list = list.filter((v) => v.risk.toLowerCase() === risk.toLowerCase());
    if (date) list = filterByDate(list, date);

    list = [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const total = list.length;
    const start = (page - 1) * pageSize;
    return { data: list.slice(start, start + pageSize), meta: { total, page, pageSize } };
  },

  "/api/analytics/summary": () => ({
    data: {
      eventsByType: mockEventsByType,
      alertsByCamera: mockAlertsByCamera,
      eventsByTime: mockEventsByTime,
      cameraHealth: mockCameraHealthStats,
      alertTrend: mockAlertTrend,
      riskDistribution: mockRiskDistribution,
    },
  }),

  "/api/health": () => ({ data: { components: mockSystemHealth, summary: mockSummary } }),

  "/api/zones": (url, options) => {
    const match = url.match(/\/api\/zones\/([^/?]+)/);
    if (match) {
      const id = match[1];
      const zone = adminZoneData.find((z) => z.id === id);
      if (!zone) return { data: null, meta: { error: "Zone not found" } };
      if (options.method === "DELETE") {
        const idx = adminZoneData.findIndex((z) => z.id === id);
        if (idx >= 0) adminZoneData.splice(idx, 1);
        return { data: { ok: true } };
      }
      if (options.method === "PUT") {
        const body = JSON.parse(options.body || "{}");
        Object.assign(zone, body);
        return { data: zone };
      }
      return { data: zone };
    }
    if (options.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const created = {
        id: body.id || `ZONE-${String(adminZoneData.length + 1).padStart(2, "0")}`,
        status: "Active",
        enabled: true,
        ...body,
      };
      adminZoneData.push(created);
      return { data: created };
    }
    return { data: adminZoneData };
  },

  "/api/map/cameras": () => ({ data: mockCameras }),
  "/api/map/alerts": () => ({ data: mockMapAlerts }),
  "/api/map/zones": () => ({ data: mockMapZones }),
  "/api/map/virtual-fences": () => ({ data: mockMapVirtualFences }),
  "/api/map/sectors": () => ({ data: mockMapSectors }),

  "/api/rules": (url, options) => {
    const rest = url.replace(/^\/api\/rules\/?/, "");
    if (rest === "thresholds") {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body || "{}");
        Object.assign(adminSeverityThresholds, body.thresholds || body);
        return { data: { thresholds: adminSeverityThresholds } };
      }
      return { data: { thresholds: adminSeverityThresholds } };
    }
    if (rest === "config") {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body || "{}");
        Object.assign(adminRiskConfig, body);
        return { data: adminRiskConfig };
      }
      return { data: adminRiskConfig };
    }
    if (rest && options.method === "PUT") {
      const rule = adminRiskRuleData.find((r) => r.id === Number(rest));
      if (rule) Object.assign(rule, JSON.parse(options.body || "{}"));
      return { data: rule };
    }
    return { data: adminRiskRuleData };
  },

  "/api/auth/login": (url, options) => {
    const body = JSON.parse(options.body || "{}");
    const cred = mockCredentialsList.find(
      (c) => c.username === body.username && c.password === body.password
    );
    if (cred) {
      return { data: { token: "mock-jwt-token", user: cred.user } };
    }
    const err = new Error("Invalid username or password");
    err.status = 401;
    throw err;
  },

  "/api/admin/cameras": (url, options) => {
    const match = url.match(/\/api\/admin\/cameras\/([^/?]+)/);
    if (match) {
      const id = match[1];
      const cam = adminCameraData.find((c) => c.id === id);
      if (!cam) return { data: null, meta: { error: "Camera not found" } };
      if (url.endsWith("/test")) {
        const ok = Math.random() > 0.3;
        return { data: { id, ok, message: ok ? "Connection Successful" : "Connection Failed" } };
      }
      if (url.endsWith("/disable")) {
        cam.enabled = false;
        cam.streamStatus = "Disabled";
        cam.aiStatus = "Paused";
        return { data: cam };
      }
      if (options.method === "PUT") {
        const body = JSON.parse(options.body || "{}");
        Object.assign(cam, body);
        return { data: cam };
      }
      return { data: cam };
    }
    if (options.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const created = {
        id: body.id || `CAM-${String(adminCameraData.length + 1).padStart(2, "0")}`,
        name: body.name || "",
        location: body.location || "",
        sector: body.sector || "North",
        streamStatus: "Offline",
        aiStatus: "Paused",
        lastSeen: "—",
        enabled: true,
        rtspMasked: body.rtspUrl ? "rtsp://***.configured" : "",
        fpsLimit: body.fpsLimit || null,
        sampling: body.sampling || "",
        description: body.description || "",
        ...body,
      };
      adminCameraData.unshift(created);
      return { data: created };
    }
    return { data: adminCameraData };
  },

  "/api/admin/users": (url, options) => {
    const match = url.match(/\/api\/admin\/users\/(\d+)/);
    if (match) {
      const id = Number(match[1]);
      const user = adminUserData.find((u) => u.id === id);
      if (!user) return { data: null, meta: { error: "User not found" } };
      if (url.endsWith("/deactivate")) {
        user.status = "Disabled";
        return { data: user };
      }
      if (options.method === "PUT") {
        const body = JSON.parse(options.body || "{}");
        Object.assign(user, body);
        return { data: user };
      }
      return { data: user };
    }
    if (options.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const created = {
        id: Math.max(...adminUserData.map((u) => u.id)) + 1,
        name: body.name || "",
        username: body.username || "",
        email: body.email || "",
        role: body.role || "Security Operator",
        status: body.status || "Active",
        lastLogin: "—",
        ...body,
      };
      adminUserData.unshift(created);
      return { data: created };
    }
    return { data: adminUserData };
  },

  "/api/admin/settings": (url, options) => {
    if (options.method === "PUT") {
      const body = JSON.parse(options.body || "{}");
      Object.assign(systemSettingsData, body);
      return { data: systemSettingsData };
    }
    return { data: systemSettingsData };
  },

  "/api/admin/audit": () => ({ data: auditLogData }),
  "/api/admin/roles": () => ({ data: adminRolePermissions }),
};

// Export additional mock datasets for pages that read directly (map/admin tabs).
export const mockAdminData = {
  cameras: mockCamerasAdmin,
  zones: mockZones,
  rules: mockRiskRules,
  users: mockUsers,
};
export const mockMapData = { markers: mockMapMarkers };
export const mockDashboardData = { intelligenceSummary: mockIntelligenceSummary };

export function initMockResolver() {
  setMockResolver((url, options = {}) => {
    const handlerKey = Object.keys(handlers).find((key) => {
      if (key.includes(":id") || key.endsWith("/ack") || key.endsWith("/me")) return false;
      return url.startsWith(key);
    });
    const handler = handlerKey && handlers[handlerKey];
    if (!handler) {
      // fall back to path-prefix matching for parameterized routes
      if (url.includes("/api/auth/login")) return handlers["/api/auth/login"](url, options);
      if (url.includes("/api/events/")) {
        const ev = mockEvents.find((e) => e.id === url.split("/").pop());
        return { data: ev ?? null };
      }
      return { data: [] };
    }
    return handler(url, options);
  });
}

export default mockCredentialsList;
