import React from "react";
import Card from "../common/Card";
import StatusIndicator from "../common/StatusIndicator";
import { CameraIcon, MapPinIcon } from "../common/Icons";

/**
 * Side panel with static camera metadata.
 */
function CameraInfoPanel({ camera }) {
  const isOnline = camera.status === "online";
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <CameraIcon size={18} />
        </div>
        <div className="min-w-0">
          <p className="section-label">Camera</p>
          <h3 className="mt-1 text-lg font-semibold text-primary">{camera.id}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">{camera.name}</p>
        </div>
        <div className="ml-auto">
          <StatusIndicator status={isOnline ? "success" : "offline"} label={isOnline ? "Online" : "Offline"} />
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-sm text-muted">
        <MapPinIcon size={15} className="text-muted" />
        <span>{camera.sector || camera.location}</span>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 p-3"><dt className="section-label">FPS</dt><dd className="mt-1.5 text-base font-semibold text-primary">{isOnline && camera.fps != null ? camera.fps : "—"}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3"><dt className="section-label">Latency</dt><dd className="mt-1.5 text-base font-semibold text-primary">{isOnline && camera.latency != null ? `${camera.latency} ms` : "—"}</dd></div>
        <div className="rounded-lg bg-slate-50 p-3"><dt className="section-label">Tracks</dt><dd className="mt-1.5 text-base font-semibold text-primary">{camera.detections?.length || 0}</dd></div>
      </dl>
      <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted">Stream</span><span className="font-medium text-secondary">{isOnline ? "Connected" : "Disconnected"}</span></div>
    </Card>
  );
}

export default CameraInfoPanel;
