import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ALERT_AUDIO_SOURCE,
  alertAudioSource,
  alertAudioVolume,
  alertDedupeId,
  alertUpdateDedupeId,
  beepSpec,
  escalationTargetSeverity,
  eventLabel,
  isEscalationUpdate,
  normalizeAlert,
  shouldNotify,
  shouldNotifyUpdate,
  shouldShowPopup,
} from "../utils/alertNotification.mjs";

// ------------------------------------------------ MEDIUM / HIGH / CRITICAL popup + beep

test("MEDIUM alert triggers popup", () => {
  assert.equal(shouldShowPopup("MEDIUM"), true);
  assert.equal(shouldNotify({ severity: "MEDIUM", alertCode: "m1" }), true);
});

test("HIGH alert triggers popup", () => {
  assert.equal(shouldShowPopup("HIGH"), true);
  assert.equal(shouldNotify({ severity: "HIGH", alertCode: "a1" }), true);
});

test("CRITICAL alert triggers popup", () => {
  assert.equal(shouldShowPopup("CRITICAL"), true);
  assert.equal(shouldNotify({ severity: "CRITICAL", alertCode: "a2" }), true);
});

test("MEDIUM beep pattern is a single high beep", () => {
  const spec = beepSpec("MEDIUM");
  assert.equal(spec.count, 1);
  assert.equal(spec.frequency, 700);
});

test("HIGH beep pattern is two distinct high beeps", () => {
  const spec = beepSpec("HIGH");
  assert.equal(spec.count, 2);
  assert.equal(spec.frequency, 900);
  assert.ok(spec.gapMs > 0, "two beeps must be separated by a gap");
});

test("CRITICAL beep pattern is three distinct beeps", () => {
  const spec = beepSpec("CRITICAL");
  assert.equal(spec.count, 3);
  assert.equal(spec.frequency, 1200);
  assert.ok(spec.gapMs > 0, "beeps must be separated by a gap");
});

test("beep loudness scales with severity (CRITICAL > HIGH > MEDIUM)", () => {
  const medium = beepSpec("MEDIUM");
  const high = beepSpec("HIGH");
  const critical = beepSpec("CRITICAL");
  assert.ok(medium.gain > 0 && medium.gain < high.gain, "MEDIUM softer than HIGH");
  assert.ok(high.gain < critical.gain, "HIGH softer than CRITICAL");
});

test("LOW / INFO / unknown never popup or beep", () => {
  for (const sev of ["LOW", "INFO", "ml-severity", undefined]) {
    assert.equal(shouldShowPopup(sev), false, `severity=${sev}`);
    assert.equal(beepSpec(sev), null, `severity=${sev}`);
    assert.equal(shouldNotify({ severity: sev, alertCode: "x" }), false);
  }
});

// ------------------------------------------------ custom mp3 alert sound

test("custom alert mp3 is provided for MEDIUM/HIGH/CRITICAL and none otherwise", () => {
  for (const sev of ["MEDIUM", "HIGH", "CRITICAL"]) {
    assert.equal(alertAudioSource(sev), ALERT_AUDIO_SOURCE, `severity=${sev}`);
  }
  for (const sev of ["LOW", "INFO", undefined, "unknown"]) {
    assert.equal(alertAudioSource(sev), null, `severity=${sev}`);
  }
});

test("alert audio volume scales with severity (CRITICAL > HIGH > MEDIUM)", () => {
  const medium = alertAudioVolume("MEDIUM");
  const high = alertAudioVolume("HIGH");
  const critical = alertAudioVolume("CRITICAL");
  assert.ok(medium > 0 && medium < high, "MEDIUM softer than HIGH");
  assert.ok(high < critical, "HIGH softer than CRITICAL");
  assert.equal(alertAudioVolume("LOW"), 0);
  assert.equal(alertAudioVolume("INFO"), 0);
});

test("severity matching is case-insensitive", () => {
  assert.equal(shouldShowPopup("high"), true);
  assert.equal(beepSpec("critical").count, 3);
});

// ------------------------------------------------ dedupe

test("dedupe id prefers alertCode over id", () => {
  assert.equal(alertDedupeId({ alertCode: "code-1", id: 42 }), "code-1");
  assert.equal(alertDedupeId({ id: 42 }), "42");
});

test("missing id returns null and never notifies", () => {
  assert.equal(alertDedupeId({}), null);
  assert.equal(shouldNotify({ severity: "HIGH" }), false);
});

test("duplicate alertCode is covered by the same stable id", () => {
  const first = alertDedupeId({ alertCode: "dup", severity: "HIGH" });
  const second = alertDedupeId({ alertCode: "dup", severity: "HIGH" });
  assert.equal(first, second);
});

// ------------------------------------------------ escalation alerts (alert:updated)

test("escalation update is detected only when fromSeverity/toSeverity present", () => {
  assert.equal(isEscalationUpdate({ fromSeverity: "MEDIUM", toSeverity: "HIGH", alertCode: "e1" }), true);
  assert.equal(isEscalationUpdate({ toSeverity: "CRITICAL", alertCode: "e2" }), true);
  assert.equal(isEscalationUpdate({ severity: "HIGH", alertCode: "e3" }), false);
  assert.equal(isEscalationUpdate({ severity: "HIGH" }), false);
});

test("escalation target severity prefers toSeverity", () => {
  assert.equal(escalationTargetSeverity({ fromSeverity: "MEDIUM", toSeverity: "HIGH", severity: "HIGH" }), "HIGH");
  assert.equal(escalationTargetSeverity({ severity: "CRITICAL" }), "CRITICAL");
});

test("escalation to HIGH/CRITICAL triggers popup; LOW escalation never does", () => {
  const high = { fromSeverity: "MEDIUM", toSeverity: "HIGH", severity: "HIGH", alertCode: "e-h" };
  const critical = { fromSeverity: "HIGH", toSeverity: "CRITICAL", severity: "CRITICAL", alertCode: "e-c" };
  const low = { fromSeverity: "INFO", toSeverity: "LOW", severity: "LOW", alertCode: "e-l" };
  const noEscalation = { severity: "HIGH", alertCode: "e-n" };
  assert.equal(shouldNotifyUpdate(high), true);
  assert.equal(shouldNotifyUpdate(critical), true);
  assert.equal(shouldNotifyUpdate(low), false);
  assert.equal(shouldNotifyUpdate(noEscalation), false);
});

test("escalation dedupe is keyed by alert + target severity", () => {
  const base = { alertCode: "a-esc" };
  assert.equal(alertUpdateDedupeId({ ...base, fromSeverity: "MEDIUM", toSeverity: "HIGH" }), "a-esc::HIGH");
  assert.equal(alertUpdateDedupeId({ ...base, fromSeverity: "HIGH", toSeverity: "CRITICAL" }), "a-esc::CRITICAL");
  assert.notEqual(alertUpdateDedupeId({ ...base, fromSeverity: "MEDIUM", toSeverity: "HIGH" }),
    alertUpdateDedupeId({ ...base, fromSeverity: "HIGH", toSeverity: "CRITICAL" }),
    "each escalation hop must notify once");
  assert.equal(alertUpdateDedupeId({ severity: "HIGH", alertCode: "a-esc" }), null);
});

// ------------------------------------------------ normalize + no fabrication

test("normalizeAlert maps socket fields without inventing data", () => {
  const a = normalizeAlert({
    alertCode: "a-9",
    severity: "HIGH",
    alertType: "LOITERING",
    cameraCode: "CAM-01",
    riskScore: 71,
  });
  assert.equal(a.id, "a-9");
  assert.equal(a.severity, "HIGH");
  assert.equal(a.eventType, "Loitering");
  assert.equal(a.cameraCode, "CAM-01");
  assert.equal(a.riskScore, 71);
  assert.equal(a.reason, null);
});

test("reasonLabel reads first reason without fabrication", () => {
  const a = normalizeAlert({
    alertCode: "a-10",
    severity: "CRITICAL",
    reason: { reasons: ["Person in restricted zone"] },
  });
  assert.equal(a.reason, "Person in restricted zone");
});

test("eventLabel falls back to the raw type / generic label", () => {
  assert.equal(eventLabel("VIRTUAL_FENCE_CROSSING"), "Virtual Fence Crossing");
  assert.equal(eventLabel("CUSTOM_EVENT"), "Custom Event");
  assert.equal(eventLabel(null), "Security Alert");
});