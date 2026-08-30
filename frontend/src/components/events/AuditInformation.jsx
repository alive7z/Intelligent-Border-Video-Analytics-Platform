import React from "react";
import Card from "../common/Card";
import { CheckCircleIcon } from "../common/Icons";

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value || "—"}</span>
    </div>
  );
}

/**
 * Operator / audit trail for events affected by operator actions.
 * Read-only here; alert actions remain on the Alerts page.
 */
function AuditInformation({ event }) {
  const acknowledged = event.acknowledgedBy;
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <CheckCircleIcon size={18} className="text-navy-700" />
        <h3 className="text-sm font-semibold text-slate-800">Operator / Audit</h3>
      </div>
      {acknowledged ? (
        <dl className="divide-y divide-slate-100 text-sm">
          <Row label="Acknowledged By" value={event.acknowledgedBy} />
          <Row label="Acknowledged At" value={event.acknowledgedAt || "—"} />
          {event.resolution && <Row label="Resolution" value={event.resolution.type} />}
          {event.resolution?.notes && <Row label="Notes" value={event.resolution.notes} />}
        </dl>
      ) : (
        <p className="text-sm text-slate-500">
          No operator action recorded for this event.
        </p>
      )}
    </Card>
  );
}

export default AuditInformation;
