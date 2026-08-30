import React from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Badge from "../common/Badge";
import { ImageIcon, PlayIcon, CameraIcon } from "../common/Icons";

// Placeholder icons referenced below
import { FileTextIcon } from "../common/Icons";

/**
 * Large evidence / snapshot panel for an alert.
 */
function AlertEvidence({ alert }) {
  const isVehicle = alert.objectType?.toLowerCase() === "vehicle";
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Incident Snapshot
          </h3>
        </div>
        <Badge tone="info">{alert.evidence?.id || "EVD-00000"}</Badge>
      </div>

      <div className="p-5">
        <div
          className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 dark:bg-[#0b101a]"
          role="img"
          aria-label="Incident snapshot"
        >
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <CameraIcon size={36} />
            <p className="mt-2 text-xs">{alert.camera} · {alert.cameraName}</p>
          </div>

          {/* Detection overlay */}
          <div
            className="absolute"
            style={{
              left: isVehicle ? "24%" : "14%",
              top: isVehicle ? "52%" : "20%",
              width: isVehicle ? "34%" : "18%",
              height: isVehicle ? "20%" : "36%",
              border: "2px solid #a3e635",
            }}
            aria-hidden="true"
          >
            <span className="absolute -top-5 left-0 rounded-sm bg-lime-500 px-1 text-[10px] font-bold uppercase text-slate-900">
              {alert.objectType || "OBJECT"} {alert.trackId ? `#${alert.trackId.split("-").pop()}` : ""}
            </span>
          </div>

          {/* Zone boundary */}
          <div
            className="pointer-events-none absolute inset-x-6 top-6 bottom-6 rounded border border-dashed border-lime-300/40"
            aria-hidden="true"
          >
            <span className="absolute -top-3 left-2 rounded bg-lime-300/20 px-1.5 py-0.5 text-[10px] uppercase text-lime-200">
              Restricted Zone Boundary
            </span>
          </div>

          {/* Timestamp */}
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {alert.evidence?.capturedAt || alert.timestamp}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm">
            <FileTextIcon size={14} /> View Snapshot
          </Button>
          <Button variant="secondary" size="sm">
            <PlayIcon size={14} /> Play Incident Clip
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Evidence {alert.evidence?.id || "—"} · Captured at{" "}
          {alert.evidence?.capturedAt || "—"} · Camera {alert.evidence?.camera || alert.camera}
        </p>
      </div>
    </Card>
  );
}

export default AlertEvidence;
