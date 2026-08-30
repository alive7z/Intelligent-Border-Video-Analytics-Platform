import React from "react";
import Card from "../common/Card";
import { MapPinIcon } from "../common/Icons";

/**
 * Clean static map placeholder for the dashboard.
 * (Leaflet/MapLibre integration is planned on the dedicated /map page.)
 */
function BorderMapPreview() {
  const sectors = [
    { name: "North Sector", x: "50%", y: "22%", severity: "info" },
    { name: "Central Sector", x: "62%", y: "48%", severity: "info" },
    { name: "East Sector", x: "82%", y: "60%", severity: "high" },
    { name: "West Sector", x: "22%", y: "45%", severity: "info" },
    { name: "South Sector", x: "48%", y: "78%", severity: "medium" },
  ];

  const severityColors = {
    info: "bg-green-500",
    high: "bg-red-500",
    medium: "bg-yellow-500",
    critical: "bg-red-600",
  };

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <MapPinIcon size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Border Zone Map
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
            Medium
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            High
          </span>
        </div>
      </div>

      <div className="p-5">
        <div
          className="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200"
          role="img"
          aria-label="Border zone map preview showing sector markers"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(rgba(12,27,61,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(12,27,61,0.04) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              backgroundColor: "#eef1f6",
            }}
          />
          {sectors.map((s) => (
            <div
              key={s.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: s.x, top: s.y }}
            >
              <span
                className={`block h-3.5 w-3.5 rounded-full ring-4 ring-white ${severityColors[s.severity]}`}
              />
              <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default BorderMapPreview;
