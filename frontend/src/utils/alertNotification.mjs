// Pure decision + normalization logic for the realtime alert popup/beep.
// Kept free of React/DOM so it is unit-testable with `node --test`.

const NOTIFICATION_SEVERITIES = new Set(["MEDIUM", "HIGH", "CRITICAL"]);

// Custom alert sound shipped with the app (public/audio/alert-beep.mp3).
// BASE_URL keeps the path correct when the UI is served under a sub-path.
export const ALERT_AUDIO_SOURCE = `${(import.meta.env && import.meta.env.BASE_URL) || "/"}audio/alert-beep.mp3`;

/**
 * The alert sound file to play for a severity (MEDIUM/HIGH/CRITICAL all use
 * the same custom beep). LOW/INFO never play it.
 */
export function alertAudioSource(severity) {
  return shouldShowPopup(severity) ? ALERT_AUDIO_SOURCE : null;
}

/**
 * Playback volume per severity. Scales with severity so CRITICAL is the
 * loudest, MEDIUM the softest. Returns 0 for severities that must stay silent.
 */
export function alertAudioVolume(severity) {
  const s = String(severity || "").toUpperCase();
  if (s === "CRITICAL") return 0.85;
  if (s === "HIGH") return 0.7;
  if (s === "MEDIUM") return 0.5;
  return 0;
}

/**
 * MEDIUM, HIGH and CRITICAL alerts trigger the realtime popup + beep.
 * LOW / INFO are logged by the bell but never interrupt the user.
 */
export function shouldShowPopup(severity) {
  return NOTIFICATION_SEVERITIES.has(String(severity || "").toUpperCase());
}

/**
 * Beep pattern per severity. Volume scales with severity: MEDIUM is softest,
 * HIGH louder, CRITICAL loudest. Returns null for severities that must NOT beep.
 */
export function beepSpec(severity) {
  const s = String(severity || "").toUpperCase();
  if (s === "CRITICAL") {
    return { count: 3, frequency: 1200, durationMs: 150, gapMs: 120, gain: 0.85 };
  }
  if (s === "HIGH") {
    return { count: 2, frequency: 900, durationMs: 140, gapMs: 100, gain: 0.7 };
  }
  if (s === "MEDIUM") {
    return { count: 1, frequency: 700, durationMs: 120, gapMs: 0, gain: 0.5 };
  }
  return null;
}

/**
 * Stable identifier used for client-side dedupe. The backend emits
 * alert.alertCode (UUID); nothing else may be reused across deliveries.
 */
export function alertDedupeId(data) {
  const id = data?.alertCode || data?.id;
  return id ? String(id) : null;
}

/**
 * An escalation update is an `alert:updated` emission that raised the alert
 * severity (e.g. MEDIUM -> HIGH -> CRITICAL). Only the backend's escalation
 * path sets fromSeverity/toSeverity; ack/investigate/resolve/delete do not.
 */
export function isEscalationUpdate(data) {
  return Boolean(data?.fromSeverity || data?.toSeverity);
}

/**
 * Severity that took effect after the escalation (toSeverity wins because the
 * event's severity is authoritative for the new state).
 */
export function escalationTargetSeverity(data) {
  const s = data?.toSeverity || data?.severity;
  return String(s || "").toUpperCase();
}

/**
 * Dedupe id for an escalation update. Keyed by alert + target severity so that
 * MEDIUM -> HIGH -> CRITICAL each notify once, while a re-delivered update for
 * the same target severity is suppressed.
 */
export function alertUpdateDedupeId(data) {
  if (!isEscalationUpdate(data)) return null;
  const base = alertDedupeId(data);
  if (!base) return null;
  return `${base}::${escalationTargetSeverity(data)}`;
}

const EVENT_LABELS = {
  SUSPICIOUS_ACTIVITY: "Suspicious Activity",
  VIRTUAL_FENCE_CROSSING: "Virtual Fence Crossing",
  RESTRICTED_ZONE_ENTRY: "Restricted Zone Entry",
  REPEATED_ENTRY: "Repeated Entry",
  LOITERING: "Loitering",
  NIGHT_MOVEMENT: "Night Movement",
};

export function eventLabel(type) {
  const t = String(type || "");
  if (!t) return "Security Alert";
  const upper = t.toUpperCase();
  return EVENT_LABELS[upper] || upper.replace(/_/g, " ");
}

export function reasonLabel(data) {
  const reasons = data?.reason?.reasons || data?.reasons || [];
  if (Array.isArray(reasons) && reasons.length > 0) {
    const first = reasons[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return first.description || first.code || null;
  }
  return null;
}

/**
 * Normalized payload consumed by the popup UI. Never fabricates fields that
 * the socket did not provide.
 */
export function normalizeAlert(data) {
  const severity = String(data?.severity || "").toUpperCase();
  return {
    id: alertDedupeId(data),
    severity,
    eventType: eventLabel(data?.eventType || data?.alertType),
    cameraCode: data?.cameraCode || "—",
    riskScore: data?.riskScore ?? null,
    reason: reasonLabel(data),
  };
}

export function shouldNotify(data) {
  return shouldShowPopup(data?.severity) && alertDedupeId(data) !== null;
}

export function shouldNotifyUpdate(data) {
  return (
    isEscalationUpdate(data) &&
    shouldShowPopup(escalationTargetSeverity(data)) &&
    alertDedupeId(data) !== null
  );
}