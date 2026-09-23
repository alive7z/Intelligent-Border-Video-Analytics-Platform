import React from "react";
import Card from "../common/Card";
import { formatDateTime } from "../../utils/date";
import { formatEventLabel } from "../../utils/eventTypeLabels";

export default function RelatedEvidence({ items = [] }) {
  const visibleItems = items.filter((item) => item?.type !== "INCIDENT_CLIP");
  return <Card>
    <h3 className="mb-3 text-sm font-semibold text-primary">Evidence Records</h3>
    {visibleItems.length ? <ul className="space-y-2 text-xs text-secondary">{visibleItems.map((item) => <li key={item.id}>
      {formatEventLabel(item.type)} · {formatDateTime(item.capturedAt)}
      <span className="block break-all text-muted">{item.id}</span>
    </li>)}</ul> : <p className="text-sm text-muted">No linked evidence records available.</p>}
  </Card>;
}
