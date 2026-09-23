// Shared display-label helpers for machine-readable enum / event codes.
// The backend contract (values like SUSPICIOUS_ACTIVITY, false_positive,
// restricted-zone) is never altered; these helpers only produce human-facing
// labels for the UI.

const EVENT_TYPE_LABELS = Object.freeze({
  SUSPICIOUS_ACTIVITY: "Suspicious Activity",
  PERSON_DETECTED: "Person Detected",
  NIGHT_MOVEMENT: "Night Movement",
  FACE_DETECTED: "Face Detected",
  LOITERING: "Loitering",
  VEHICLE_DETECTED: "Vehicle Detected",
  PLATE_DETECTED: "Plate Detected",
  FENCE_PROXIMITY: "Fence Proximity",
  VIRTUAL_FENCE_CROSSING: "Virtual Fence Crossing",
  RESTRICTED_ZONE_ENTRY: "Restricted Zone Entry",
  RESTRICTED_ZONE: "Restricted Zone",
  REPEATED_ENTRY: "Repeated Entry",
  TOWARD_BOUNDARY: "Toward Boundary",
  UNUSUAL_SPEED: "Unusual Speed",
  PROLONGED_STAY: "Prolonged Stay",
  VEHICLE_IN_RESTRICTED_ZONE: "Vehicle in Restricted Zone",
  PERSON_LICENSE_PLATE_READ: "License Plate Read",
});

const EMPTY_LABEL = "\u2014"; // em dash, consistent with the rest of the UI

/**
 * Convert a machine-readable label into a clean human-readable Title Case
 * display string. Inputs that are already human-readable are left unchanged.
 *
 *  formatEventLabel("suspicious_activity") -> "Suspicious Activity"
 *  formatEventLabel("NIGHT_MOVEMENT")      -> "Night Movement"
 *  formatEventLabel("vehicle_detected")    -> "Vehicle Detected"
 *  formatEventLabel("restricted-zone")     -> "Restricted Zone"
 *  formatEventLabel("Restricted Zone")     -> "Restricted Zone"
 *  formatEventLabel(null / "" / undefined) -> "—"
 *
 * @param {*} value raw backend value (string or nullish)
 * @returns {string} human-readable label
 */
export function formatEventLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return EMPTY_LABEL;
  const key = raw.toUpperCase();
  if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key];
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Dedicated event-type helper, kept for backward compatibility with charts and
 * tables. Delegates to the shared formatter but keeps the "Unknown" fallback
 * expected by those call sites.
 */
export function formatEventTypeLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  return formatEventLabel(raw);
}
export function prepareEventsByType(data = []) {
  return data
    .map((item) => ({
      ...item,
      displayName: formatEventTypeLabel(item.name),
    }))
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
}