import React from "react";
import Card from "../common/Card";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Human-readable risk reason breakdown for an alert.
 * Intended to later receive { risk_score, reasons[] } from the backend.
 */
function RiskReasons({ alert }) {
  const reasons = alert.reasons || [];
  const total = reasons.reduce((s, r) => s + (r.score || 0), 0);

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-primary">
        Why This Alert Was Generated
      </h3>
      <ul className="space-y-2.5">
        {reasons.map((r, i) => (
          <li key={i}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">{formatEventLabel(r.label)}</span>
              <span className="font-medium text-primary">{Number.isFinite(r.score) ? `+${r.score}` : "Recorded"}</span>
            </div>
            {Number.isFinite(r.score) && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{
                  width: `${Math.min(100, (r.score / Math.max(60, total)) * 100)}%`,
                }}
              />
            </div>}
          </li>
        ))}
      </ul>
      {!reasons.length && <p className="text-sm text-muted">No reason breakdown was stored for this alert.</p>}
      {reasons.some((reason) => Number.isFinite(reason.score)) && <p className="mt-3 text-xs text-muted">Recorded normalized factors plus duration contributions; the final score is capped at 100. Severity also follows confirmation rules.</p>}
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-sm font-medium text-secondary">
          Total Risk Score
        </span>
        <span className="text-lg font-bold text-primary">
          {alert.riskScore}
          <span className="text-sm font-medium text-muted"> /100</span>
        </span>
      </div>
    </Card>
  );
}

export default RiskReasons;
