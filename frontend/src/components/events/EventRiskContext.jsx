import React from "react";
import Card from "../common/Card";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import { ActivityIcon } from "../common/Icons";
import { mapRiskReasons } from "../../utils/riskReasons.mjs";
import { formatEventLabel } from "../../utils/eventTypeLabels";

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">
        {value == null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

/**
 * Explainable risk context for security events. Informational events that
 * carry no elevated conditions show a placeholder message instead.
 */
function EventRiskContext({ event }) {
  const ctx = event.context || {};
  const reasons = mapRiskReasons(ctx);
  const hasRisk = reasons.length > 0 || event.riskScore != null;

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <ActivityIcon size={18} className="text-white" />
        <h3 className="text-sm font-semibold text-slate-800">Risk Context</h3>
      </div>

      {hasRisk ? (
        <dl className="divide-y divide-slate-100 text-sm">
          {reasons.map((reason, index) => <Row key={index} label={reason.label} value={reason.score == null ? "Recorded" : `+${reason.score}`} />)}
          <Row label="Direction" value={formatEventLabel(ctx.direction)} />
          {ctx.duration != null && <Row label="Duration" value={`${ctx.duration} seconds`} />}
          <Row label="Risk Score" value={event.riskScore == null ? "—" : `${event.riskScore} / 100`} />
          <Row label="Severity" value={<AlertSeverityBadge severity={event.severity} />} />
        </dl>
      ) : (
        <p className="text-sm text-slate-500">
          No risk assessment was stored for this event.
        </p>
      )}
    </Card>
  );
}

export default EventRiskContext;
