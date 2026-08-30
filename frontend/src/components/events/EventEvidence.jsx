import React from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import Badge from "../common/Badge";
import { ImageIcon, PlayIcon, CameraIcon } from "../common/Icons";

/**
 * Evidence / camera snapshot panel for an event detail.
 * The incident clip button is only shown when the event has clip evidence.
 */
function EventEvidence({ event }) {
  const isVehicle = event.objectType?.toLowerCase() === "vehicle";
  const hasClip = Boolean(event.clip) || Boolean(event.evidence?.clip);
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={18} className="text-navy-700" />
          <h3 className="text-sm font-semibold text-slate-800">
            Event Evidence
          </h3>
        </div>
        <Badge tone="info">{event.evidence?.id || "EVD-" + event.id.split("-").pop()}</Badge>
      </div>

      <div className="p-5">
        <div
          className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 dark:bg-[#0b101a]"
          role="img"
          aria-label="Event snapshot"
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
            <p className="mt-2 text-xs">{event.camera} · {event.cameraName}</p>
          </div>

          {/* Detection overlay */}
          {event.context?.restrictedZone || event.context?.fenceProximity ? (
            <>
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
                  {event.objectType || "OBJECT"} {event.trackId ? `#${event.trackId.split("-").pop()}` : ""}
                </span>
              </div>
              <div
                className="pointer-events-none absolute inset-x-6 top-6 bottom-6 rounded border border-dashed border-lime-300/40"
                aria-hidden="true"
              >
                <span className="absolute -top-3 left-2 rounded bg-lime-300/20 px-1.5 py-0.5 text-[10px] uppercase text-lime-200">
                  Restricted Zone Boundary
                </span>
              </div>
            </>
          ) : null}

          {/* Timestamp */}
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {event.evidence?.capturedAt || event.timestamp}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm">
            <ImageIcon size={14} /> View Snapshot
          </Button>
          {hasClip && (
            <Button variant="secondary" size="sm">
              <PlayIcon size={14} /> Play Clip
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Captured at {event.evidence?.capturedAt || "—"} · Camera {event.camera} ·{" "}
          Evidence {event.evidence?.id || "—"}
        </p>
      </div>
    </Card>
  );
}

export default EventEvidence;
