import React from "react";
import RiskBadge from "./RiskBadge";
import { DetailRow, Snapshot, CameraButton, EventButton } from "../DetailBits";
import { formatDateTime } from "../../../utils/date";

/**
 * Vehicle intelligence detail. Vehicles are never labelled as blacklisted /
 * wanted / stolen — only as plates read by the system.
 */
function VehicleDetails({ vehicle, eventType }) {
  const duration = (() => {
    const toSec = (t) => {
      if (!t) return null;
      const p = String(t).split(":").map(Number);
      if (p.length !== 3 || p.some(Number.isNaN)) return null;
      return p[0] * 3600 + p[1] * 60 + p[2];
    };
    const a = toSec(vehicle.firstSeen);
    const b = toSec(vehicle.lastSeen);
    if (a == null || b == null || b < a) return "—";
    return `${b - a}s`;
  })();

  return (
    <div>
      <dl className="divide-y divide-slate-100 text-sm">
        <DetailRow label="Vehicle Track ID" value={vehicle.trackId} />
        <DetailRow label="Vehicle Type" value={vehicle.vehicleType} />
        <DetailRow label="Detection Confidence" value={`${Math.round((vehicle.confidence || 0) * 100)}%`} />
        <DetailRow label="Camera" value={`${vehicle.cameraId} · ${vehicle.cameraName}`} />
        <DetailRow label="Location" value={vehicle.location} />
        <DetailRow label="Direction" value={vehicle.direction} />
        <DetailRow label="Speed" value={vehicle.speed != null ? `${vehicle.speed} km/h` : "—"} />
        <DetailRow label="First Seen" value={vehicle.firstSeen} />
        <DetailRow label="Last Seen" value={vehicle.lastSeen} />
        <DetailRow label="Duration" value={duration} />
        <DetailRow label="Plate Number" value={vehicle.plateNumber && vehicle.plateNumber !== "—" ? vehicle.plateNumber : "Not read"} />
        <DetailRow label="Current Risk" value={<RiskBadge risk={vehicle.risk} />} />
        <DetailRow label="Timestamp" value={formatDateTime(vehicle.timestamp)} />
      </dl>

      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Vehicle Snapshot
        </p>
        <Snapshot label="Vehicle Snapshot" sublabel={`${vehicle.cameraId} · ${vehicle.cameraName}`} />
      </div>

      <div className="mt-4">
        <CameraButton cameraId={vehicle.cameraId} />
      </div>
      {vehicle.relatedEventId && (
        <EventButton eventId={vehicle.relatedEventId} eventType={eventType} />
      )}
    </div>
  );
}

export default VehicleDetails;
