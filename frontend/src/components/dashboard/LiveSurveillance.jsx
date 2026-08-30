import React, { useState } from "react";
import PlaceholderCamera from "./PlaceholderCamera";
import Badge from "../common/Badge";
import StatusIndicator from "../common/StatusIndicator";
import {
  MaximizeIcon,
  PauseIcon,
  PlayIcon,
  CameraIcon,
  MapPinIcon,
} from "../common/Icons";

/**
 * Large live surveillance preview used on the dashboard overview.
 */
function LiveSurveillance() {
  const [paused, setPaused] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <CameraIcon size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Live Surveillance
          </h3>
          <Badge tone="danger" dot>
            LIVE
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <MaximizeIcon size={14} /> Expand
          </button>
        </div>
      </div>

      <div className="p-5">
        <PlaceholderCamera
          label={paused ? "Feed Paused" : "CAM-01 · North Border Sector"}
          className="aspect-[16/9] rounded-lg"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-600">
              <CameraIcon size={15} className="text-slate-400" />
              <span className="font-medium text-slate-800">CAM-01</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <MapPinIcon size={15} className="text-slate-400" />
              North Border Sector
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              FPS: <span className="font-medium text-slate-700">24</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              Latency: <span className="font-medium text-slate-700">120 ms</span>
            </span>
          </div>
          <StatusIndicator status="success" label="All streams healthy" />
        </div>
      </div>
    </div>
  );
}

export default LiveSurveillance;
