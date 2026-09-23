import React from "react";
import Card from "../common/Card";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import AlertStatusBadge from "../alerts/AlertStatusBadge";
import { InfoIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";
import { formatEventLabel } from "../../utils/eventTypeLabels";

function Row({ label, value, children }) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-muted">{label}</span>
      {children ? (
        <span className="text-sm font-medium text-primary">{children}</span>
      ) : (
        <span className="text-sm font-medium text-primary">{displayValue}</span>
      )}
    </div>
  );
}

/**
 * Event metadata panel.
 */
function EventDetailsCard({ event }) {
  const cameraLabel = [event.cameraId || event.camera, event.cameraName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <InfoIcon size={18} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-primary">Event Information</h3>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        <Row label="Event ID" value={event.id} />
        <Row label="Event Type" value={formatEventLabel(event.type)} />
        <Row label="Camera" value={cameraLabel} />
        <Row label="Location" value={event.location} />
        <Row label="Object Type" value={formatEventLabel(event.objectType)} />
        <Row label="Track ID" value={event.trackId} />
        <Row label="Vehicle Number" value={event.vehiclePlate || (event.objectType?.toLowerCase() === "vehicle" ? "Plate not confirmed" : null)} />
        <Row label="Risk Score" value={event.riskScore == null ? "—" : `${event.riskScore} / 100`} />
        <Row label="Severity">
          <AlertSeverityBadge severity={event.severity} />
        </Row>
        <Row label="Status">
          <AlertStatusBadge status={event.status} />
        </Row>
        <Row label="Timestamp" value={formatDateTime(event.timestamp)} />
      </dl>
    </Card>
  );
}

export default EventDetailsCard;
