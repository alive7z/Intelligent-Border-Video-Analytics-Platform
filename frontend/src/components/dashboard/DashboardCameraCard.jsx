import React from "react";
import { Link } from "react-router-dom";
import CameraPreview from "../surveillance/CameraPreview";
import { MapPinIcon, ArrowRightIcon } from "../common/Icons";

/**
 * Compact landscape camera card for the Overview "Live Surveillance" section.
 * Shares the same fixed 16:9 preview + tight identity footer as the full
 * surveillance cards, so both surfaces look like one consistent system.
 * Only ONLINE cameras render here. Clicking opens the full camera view.
 */
function DashboardCameraCard({ camera }) {
  const location = camera.sector || camera.location || "Location unavailable";

  return (
    <Link
      to={`/surveillance/${camera.id}`}
      className="card group flex h-full min-w-0 flex-col overflow-hidden transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-blue-500/30 hover:shadow-lift"
      aria-label={`Open ${camera.id}`}
    >
      <CameraPreview camera={camera} />

      <div className="flex min-w-0 items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-primary">
            {camera.id}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <MapPinIcon size={11} className="shrink-0 opacity-60" />
            <span className="truncate">{location}</span>
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase text-muted transition-colors duration-150 group-hover:border-blue-500/40 group-hover:text-blue-600 dark:border-slate-100/15 dark:bg-slate-100/[0.04] dark:group-hover:text-blue-400">
          View
          <ArrowRightIcon size={11} className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export default DashboardCameraCard;