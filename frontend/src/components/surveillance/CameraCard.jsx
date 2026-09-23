import React from "react";
import { Link } from "react-router-dom";
import CameraPreview from "./CameraPreview";
import Badge from "../common/Badge";
import { severityTone } from "../../utils/severity";
import { relativeTime } from "../../utils/date";
import { MapPinIcon, ArrowRightIcon, ClockIcon } from "../common/Icons";

function countByKind(detections = []) {
  return detections.reduce(
    (acc, d) => {
      if (d.kind === "person") acc.persons += 1;
      if (d.kind === "vehicle") acc.vehicles += 1;
      return acc;
    },
    { persons: 0, vehicles: 0 }
  );
}

function detectionSummary(detections) {
  const { persons, vehicles } = countByKind(detections);
  const total = persons + vehicles;
  const parts = [];
  if (persons) parts.push(`${persons} Person${persons > 1 ? "s" : ""}`);
  if (vehicles) parts.push(`${vehicles} Vehicle${vehicles > 1 ? "s" : ""}`);
  return { total, detail: total ? parts.join(" · ") : "None" };
}

/**
 * Compact surveillance camera card with three stacked sections:
 *   1) 16:9 media/preview area (status badge, detection overlay)
 *   2) camera identity (id, name/label, location)
 *   3) compact metadata (detections / risk) + action row
 *
 * Offline cards render a simplified, muted body so they never look as heavy as
 * live cards, while keeping the exact same outer height so N cards stay equal
 * in a responsive grid.
 */
function CameraCard({ camera }) {
  const isOffline = camera.status === "offline";
  const risk = camera.risk || camera.severity || "info";
  const { total, detail } = detectionSummary(camera.detections);
  const location = camera.sector || camera.location || "Location unavailable";
  const lastSeen = camera.lastSeen || camera.lastUpdate;

  return (
    <div className="card group flex h-full flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-blue-500/30 hover:shadow-lift">
      <Link
        to={`/surveillance/${camera.id}`}
        className="block"
        aria-label={`Open ${camera.id}`}
      >
        <CameraPreview camera={camera} showAlertBanner />
      </Link>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold tracking-tight text-primary">
            {camera.id}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-muted">
            {camera.name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <MapPinIcon size={11} className="shrink-0 opacity-60" />
            <span className="truncate">{location}</span>
          </p>
        </div>

        <div className="mt-3">
          {isOffline ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-center dark:border-slate-100/15">
              <p className="text-xs font-medium text-muted">Feed unavailable</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-3 dark:divide-slate-100/10 dark:border-slate-100/10 dark:bg-slate-100/[0.04]">
              <div className="text-center">
                <p className="section-label">Detections</p>
                <p className="mt-1.5 text-sm font-bold text-primary">{total}</p>
                <p className="text-[11px] font-medium text-muted">{detail}</p>
              </div>
              <div className="text-center">
                <p className="section-label">Risk</p>
                <div className="mt-1.5">
                  <Badge tone={severityTone[risk] || "info"}>
                    {String(risk).toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2.5 dark:border-slate-100/10">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <ClockIcon size={12} className="shrink-0" />
            <span className="truncate">
              {isOffline && !lastSeen
                ? "Standby"
                : isOffline
                  ? `Last seen ${relativeTime(lastSeen)}`
                  : `Updated ${relativeTime(lastSeen)}`}
            </span>
          </p>
          <Link
            to={`/surveillance/${camera.id}`}
            className="btn-focus inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-[background-color,box-shadow] duration-150 hover:bg-blue-700"
          >
            View Camera
            <ArrowRightIcon size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default CameraCard;