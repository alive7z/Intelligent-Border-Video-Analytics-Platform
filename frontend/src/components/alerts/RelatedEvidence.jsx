import React from "react";
import Card from "../common/Card";
import { formatDateTime } from "../../utils/date";
import { formatEventLabel } from "../../utils/eventTypeLabels";

export default function RelatedEvidence({ items = [] }) {
  const visibleItems = items.filter((item) => item?.type !== "INCIDENT_CLIP");
  return <Card>
    <h3 className="mb-3 text-sm font-semibold text-slate-800">Evidence Records</h3>
    {visibleItems.length ? <ul className="space-y-2 text-xs text-slate-600">{visibleItems.map((item) => <li key={item.id}>
      {formatEventLabel(item.type)} · {formatDateTime(item.capturedAt)}
      <span className="block break-all text-slate-400">{item.id}</span>
    </li>)}</ul> : <p className="text-sm text-slate-500">No linked evidence records available.</p>}
  </Card>;
}
