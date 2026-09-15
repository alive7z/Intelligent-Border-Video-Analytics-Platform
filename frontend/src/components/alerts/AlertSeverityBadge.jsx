import React from "react";
import Badge from "../common/Badge";
import { severityTone } from "../../utils/severity";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Severity badge with an explicit text label (never color-only).
 * value is expected lowercase; it is title-cased for display.
 */
function AlertSeverityBadge({ severity, className = "" }) {
  const tone = severityTone[String(severity || "").toLowerCase()] || "info";
  return (
    <Badge tone={tone} dot className={className}>
      {formatEventLabel(severity || "info")}
    </Badge>
  );
}

export default AlertSeverityBadge;
