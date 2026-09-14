// Only recorded timestamps become timeline entries; missing stages stay absent.
export function incidentTimeline(alert) {
  return [
    { time: alert.created_at || alert.createdAt, event: "Alert created" },
    { time: alert.acknowledged_at || alert.acknowledgedAt, event: "Acknowledged by operator" },
    { time: alert.resolved_at || alert.resolvedAt, event: "Incident resolved" },
  ].filter((item) => item.time && Number.isFinite(Date.parse(item.time)))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
