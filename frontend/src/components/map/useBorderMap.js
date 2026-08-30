import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  cameraIcon,
  alertIcon,
  openReactPopup,
} from "./leafletUtils";

const ZONE_FILL = "rgba(15, 42, 79, 0.10)";
const ZONE_BORDER = "rgba(15, 42, 79, 0.55)";
const FENCE_COLOR = "#6366f1";
const GRID_SIZE = 256;

const GRATICULE_TILE_URL = (() => {
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  if (!canvas) return "";
  canvas.width = GRID_SIZE;
  canvas.height = GRID_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#dde6ef";
  ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15, 42, 79, 0.07)";
  ctx.beginPath();
  for (let i = GRID_SIZE / 8; i < GRID_SIZE; i += GRID_SIZE / 8) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i, GRID_SIZE);
    ctx.moveTo(0, i);
    ctx.lineTo(GRID_SIZE, i);
  }
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(15, 42, 79, 0.14)";
  ctx.beginPath();
  ctx.moveTo(GRID_SIZE / 2, 0);
  ctx.lineTo(GRID_SIZE / 2, GRID_SIZE);
  ctx.moveTo(0, GRID_SIZE / 2);
  ctx.lineTo(GRID_SIZE, GRID_SIZE / 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15, 42, 79, 0.25)";
  ctx.strokeRect(0.5, 0.5, GRID_SIZE - 1, GRID_SIZE - 1);
  return canvas.toDataURL("image/png");
})();

// Creates the Leaflet map once per mount.
export function useMapInstance(containerRef) {
  const mapRef = useRef(null);
  const tileRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [28.66, 77.42],
      zoom: 9,
      minZoom: 7,
      maxZoom: 17,
      zoomControl: true,
    });

    // Layer groups
    const groups = {
      sectors: L.layerGroup().addTo(map),
      zones: L.layerGroup().addTo(map),
      fences: L.layerGroup().addTo(map),
      cameras: L.layerGroup().addTo(map),
      alerts: L.layerGroup().addTo(map),
    };

    mapRef.current = { map, groups, markerIndex: { cameras: {}, alerts: {} } };
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
  }, [containerRef]);

  // Base light tiles.
  useEffect(() => {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const lightUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const lightAttr =
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    tileRef.current = L.tileLayer(lightUrl, {
      attribution: lightAttr,
      maxZoom: 19,
      errorTileUrl: GRATICULE_TILE_URL,
    }).addTo(map);
  }, []);

  return mapRef;
}

/**
 * Keeps the map layers in sync with props and exposes locate helpers.
 * Returns a ref to an object with locateCamera / locateAlert / locateZone.
 */
export function useBorderMapLayers({
  mapRef,
  data,
  layers,
  filters,
  selected,
  selectedRef,
  onSelect,
  renderPopup,
}) {
  const apiRef = useRef({});

  useEffect(() => {
    if (!mapRef.current) return;
    const { map, groups, markerIndex } = mapRef.current;

    const sectorFilter = (sector) => filters.sector === "all" || sector === filters.sector;

    // Sectors
    groups.sectors.clearLayers();
    (data.sectors || []).forEach((s) => {
      if (!sectorFilter(s.name)) return;
      L.polygon(s.coordinates, {
        color: "transparent",
        fillColor: s.color,
        fillOpacity: 1,
        weight: 0,
        interactive: false,
        className: "ibvap-sector",
      }).addTo(groups.sectors);
    });

    // Zones
    groups.zones.clearLayers();
    if (layers.zones) {
      (data.zones || []).forEach((z) => {
        if (!sectorFilter(z.sector)) return;
        const poly = L.polygon(z.coordinates, {
          color: ZONE_BORDER,
          weight: 1.5,
          dashArray: "6 6",
          fillColor: ZONE_FILL,
          fillOpacity: 1,
        })
          .addTo(groups.zones)
          .on("click", () => {
            onSelect({ kind: "zone", ...z });
            openReactPopup(poly, renderPopup({ kind: "zone", ...z }), () => {});
          });
      });
    }

    // Virtual fences
    groups.fences.clearLayers();
    if (layers.fences) {
      (data.fences || []).forEach((f) => {
        const line = L.polyline(f.coordinates, {
          color: FENCE_COLOR,
          weight: 2.5,
          dashArray: "8 8",
        })
          .addTo(groups.fences)
          .on("click", () => {
            onSelect({ kind: "fence", ...f });
            openReactPopup(line, renderPopup({ kind: "fence", ...f }), () => {});
          });
      });
    }

    // Cameras
    groups.cameras.clearLayers();
    markerIndex.cameras = {};
    if (layers.cameras) {
      (data.cameras || []).forEach((cam) => {
        if (!sectorFilter(cam.sector)) return;
        const show =
          filters.status === "all" ||
          (filters.status === "online" && String(cam.status).toLowerCase() === "online") ||
          (filters.status === "offline" && String(cam.status).toLowerCase() === "offline") ||
          (filters.status === "alert" && Boolean(cam.activeAlert));
        if (!show) return;

        const m = L.marker([cam.lat, cam.lng], {
          icon: cameraIcon(cam, selectedRef.current?.kind === "camera" && selectedRef.current.id === cam.id),
          title: `${cam.id} · ${cam.name}`,
          alt: `${cam.id} camera ${cam.status}`,
        })
          .addTo(groups.cameras)
          .on("click", () => {
            onSelect({ kind: "camera", ...cam });
            openReactPopup(m, renderPopup({ kind: "camera", ...cam }), () => {});
          });
        markerIndex.cameras[cam.id] = m;
      });
    }

    // Alerts
    groups.alerts.clearLayers();
    markerIndex.alerts = {};
    if (layers.alerts) {
      (data.alerts || []).forEach((a) => {
        if (!sectorFilter(a.sector)) return;
        if (filters.severity !== "all" && String(a.severity).toLowerCase() !== filters.severity) return;
        const m = L.marker([a.lat, a.lng], {
          icon: alertIcon(a, selectedRef.current?.kind === "alert" && selectedRef.current.id === a.id),
          title: `${a.id} · ${a.type}`,
          alt: `${a.id} active alert`,
        })
          .addTo(groups.alerts)
          .on("click", () => {
            onSelect({ kind: "alert", ...a });
            openReactPopup(m, renderPopup({ kind: "alert", ...a }), () => {});
          });
        markerIndex.alerts[a.id] = m;
      });
    }

    apiRef.current.locateCamera = (id) => {
      const m = markerIndex.cameras[id];
      const cam = (data.cameras || []).find((c) => c.id === id);
      if (cam) {
        map.setView([cam.lat, cam.lng], 14);
        if (m) {
          onSelect({ kind: "camera", ...cam });
          openReactPopup(m, renderPopup({ kind: "camera", ...cam }), () => {});
        }
      }
    };
    apiRef.current.locateAlert = (id) => {
      const a = (data.alerts || []).find((x) => x.id === id);
      if (a) {
        map.setView([a.lat, a.lng], 13);
        const m = markerIndex.alerts[id];
        onSelect({ kind: "alert", ...a });
        if (m) openReactPopup(m, renderPopup({ kind: "alert", ...a }), () => {});
      }
    };
    apiRef.current.locateZone = (id) => {
      const z = (data.zones || []).find((x) => x.id === id);
      if (z) {
        const bounds = L.latLngBounds(z.coordinates);
        map.fitBounds(bounds, { padding: [30, 30] });
        onSelect({ kind: "zone", ...z });
      }
    };
    apiRef.current.search = (term) => {
      const q = String(term || "").trim().toLowerCase();
      if (!q) return false;
      const cam = (data.cameras || []).find(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.sector.toLowerCase().includes(q)
      );
      if (cam) {
        apiRef.current.locateCamera(cam.id);
        return true;
      }
      const alert = (data.alerts || []).find((a) => a.id.toLowerCase().includes(q));
      if (alert) {
        apiRef.current.locateAlert(alert.id);
        return true;
      }
      const sector = (data.cameras || []).find((c) => c.sector.toLowerCase() === q);
      if (sector) {
        map.setView([sector.lat, sector.lng], 11);
        return true;
      }
      return false;
    };
    apiRef.current.invalidate = () => map.invalidateSize();
  }, [mapRef, data, layers, filters, selectedRef, onSelect, renderPopup]);

  return apiRef;
}
