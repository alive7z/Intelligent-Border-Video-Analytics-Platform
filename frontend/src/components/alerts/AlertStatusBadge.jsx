import React from "react";
import Badge from "../common/Badge";
import { statusTone } from "../../utils/severity";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Status badge (New / Active / Acknowledged / Resolved).
 */
function AlertStatusBadge({ status, className = "" }) {
  const tone = statusTone[(status || "").toLowerCase()] || "default";
  return <Badge tone={tone} className={className}>{formatEventLabel(status)}</Badge>;
}

export default AlertStatusBadge;
