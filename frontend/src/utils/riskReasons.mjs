export function mapRiskReasons(reason) {
  if (!reason || typeof reason !== "object") return [];
  const items = reason.reasonDetails || reason.reasons || [];
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const code = typeof item === "string" ? item : item?.code || item?.type;
    const score = typeof item === "object" && Number.isFinite(item?.contribution) ? item.contribution : null;
    const duration = typeof item === "object" && Number.isFinite(item?.durationSeconds) ? item.durationSeconds : null;
    const label = String(code || "Recorded risk condition").replaceAll("_", " ") + (duration > 0 ? ` — ${duration} sec` : "");
    return { code, label, score };
  });
}
