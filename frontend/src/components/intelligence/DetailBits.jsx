import React from "react";
import { Link } from "react-router-dom";
import Badge from "../common/Badge";
import { CameraIcon, ImageIcon } from "../common/Icons";

export function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">
        {value || "—"}
      </span>
    </div>
  );
}

/**
 * Link to the live camera associated with an intelligence record.
 */
export function CameraButton({ cameraId, label = "View Camera" }) {
  return (
    <Link
      to={`/surveillance/${cameraId}`}
      className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <CameraIcon size={14} /> {label}
    </Link>
  );
}

/**
 * Link to the related event.
 */
export function EventButton({ eventId, eventType }) {
  if (!eventId) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">Related Event</p>
      <p className="text-sm font-semibold text-slate-800">{eventId}</p>
      {eventType && <p className="text-xs text-slate-500">{eventType}</p>}
      <Link
        to={`/events/${eventId}`}
        className="btn-focus mt-2 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        View Event
      </Link>
    </div>
  );
}

/**
 * Placeholder snapshot / crop panels.
 */
export function Snapshot({ label = "Snapshot", sublabel = "" }) {
  return (
    <div           className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 dark:bg-[#0b101a]">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
        <ImageIcon size={32} />
        <p className="mt-2 text-xs">{label}</p>
        {sublabel && <p className="text-[10px] text-slate-600">{sublabel}</p>}
      </div>
    </div>
  );
}

export function CroppedImage({ label = "Crop", sublabel = "" }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-6">
      <div className="text-center text-slate-400">
        <ImageIcon size={24} className="mx-auto" />
        <p className="mt-1 text-xs">{label}</p>
        {sublabel && <p className="text-[10px] text-slate-400">{sublabel}</p>}
      </div>
    </div>
  );
}

export function StatusBadge({ tone = "default", children }) {
  return <Badge tone={tone}>{children}</Badge>;
}
