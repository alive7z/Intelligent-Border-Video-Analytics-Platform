import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";
import {
  ALERT_AUDIO_SOURCE,
  alertAudioSource,
  alertAudioVolume,
  alertDedupeId,
  alertUpdateDedupeId,
  beepSpec,
  escalationTargetSeverity,
  eventLabel,
  normalizeAlert,
  shouldNotify,
  shouldNotifyUpdate,
} from "../../utils/alertNotification.mjs";
import { XIcon, ExternalLinkIcon } from "./Icons";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Audio for the custom alert beep (public/audio/alert-beep.mp3). The Web
 * Audio oscillator below is only a fallback if the mp3 cannot load/play.
 */
let audioCtx = null;
let audioUnlocked = false;
let beepAudio = null;

function unlockAudio() {
  if (audioUnlocked) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(() => { audioUnlocked = true; });
  } catch (_) {
    // Web Audio API unavailable — visual-only mode.
  }
  // Warm the mp3 element inside the user gesture so later alert plays are
  // allowed by the autoplay policy (played muted then paused).
  try {
    if (!beepAudio) {
      beepAudio = new Audio(ALERT_AUDIO_SOURCE);
      beepAudio.preload = "auto";
    }
    if (beepAudio.paused) {
      beepAudio.volume = 0;
      const p = beepAudio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          beepAudio.pause();
          beepAudio.currentTime = 0;
          audioUnlocked = true;
        }).catch(() => {});
      }
    }
  } catch (_) {
    // The mp3 path is best-effort; fallback beep still works via unlockAudio.
  }
}

function playAlertSound(severity) {
  const volume = alertAudioVolume(severity);
  if (volume <= 0) return;
  try {
    const src = alertAudioSource(severity);
    if (src) {
      beepAudio = beepAudio || new Audio(src);
      beepAudio.preload = "auto";
      beepAudio.volume = volume;
      beepAudio.currentTime = 0;
      const p = beepAudio.play();
      if (p && typeof p.catch === "function") p.catch(() => playBeep(beepSpec(severity)));
      return;
    }
  } catch (_) {
    // Fall through to the generated beep below.
  }
  playBeep(beepSpec(severity));
}

function playBeep(spec) {
  if (!audioCtx || audioCtx.state !== "running" || !spec) return;
  try {
    const now = audioCtx.currentTime;
    const { count, frequency, durationMs, gapMs, gain } = spec;
    const peak = typeof gain === "number" ? gain : 0.35;
    const duration = durationMs / 1000;
    const gap = gapMs / 1000;

    for (let i = 0; i < count; i++) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      g.gain.setValueAtTime(peak, now + i * (duration + gap));
      g.gain.exponentialRampToValueAtTime(0.001, now + i * (duration + gap) + duration);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(now + i * (duration + gap));
      osc.stop(now + i * (duration + gap) + duration);
    }
  } catch (_) {
    // Beep is best-effort — never block UI.
  }
}

const SEVERITY_STYLES = {
  CRITICAL: {
    bg: "bg-red-50 dark:bg-red-900/30",
    border: "border-red-500",
    badge: "bg-red-600 text-white",
    ring: "ring-red-400",
    text: "text-red-900 dark:text-red-100",
    sub: "text-red-700 dark:text-red-300",
    pulse: "bg-red-500",
  },
  HIGH: {
    bg: "bg-orange-50 dark:bg-orange-900/30",
    border: "border-orange-500",
    badge: "bg-orange-600 text-white",
    ring: "ring-orange-400",
    text: "text-orange-900 dark:text-orange-100",
    sub: "text-orange-700 dark:text-orange-300",
    pulse: "bg-orange-500",
  },
  MEDIUM: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-500",
    badge: "bg-amber-600 text-white",
    ring: "ring-amber-400",
    text: "text-amber-900 dark:text-amber-100",
    sub: "text-amber-700 dark:text-amber-300",
    pulse: "bg-amber-500",
  },
};

/**
 * Slide-down alert notification popup for MEDIUM / HIGH / CRITICAL alerts.
 * Mounts inside the authenticated app (needs RealtimeProvider + React Router).
 *
 * - Deduplicates by alert id
 * - Plays a beep after user interaction
 * - Auto-dismisses after 8 seconds
 * - Manual close via X button
 * - "View Alert" navigates to /alerts/:alertId
 */
export default function AlertNotification() {
  const { subscribe } = useRealtime();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const seenIdsRef = useRef(new Set());
  const autoDismissRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    seenIdsRef.current.delete(id);
    const timer = autoDismissRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      autoDismissRef.current.delete(id);
    }
  }, []);

  const showAlert = useCallback(({ id, severity, data }) => {
    if (!id || seenIdsRef.current.has(id)) return;
    seenIdsRef.current.add(id);

    // Ensure audio is unlocked (browser requires user gesture first).
    unlockAudio();
    playAlertSound(severity);

    setAlerts((prev) => [...prev, { ...normalizeAlert(data), id, severity }]);

    // Auto-dismiss after 8 seconds.
    const timer = setTimeout(() => dismiss(id), 8000);
    autoDismissRef.current.set(id, timer);
  }, [dismiss]);

  const handleAlert = useCallback((payload) => {
    const data = payload?.data || payload;
    if (!shouldNotify(data)) return;
    showAlert({
      id: alertDedupeId(data),
      severity: String(data?.severity || "").toUpperCase(),
      data,
    });
  }, [showAlert]);

  // Escalations re-emit on ALERT_UPDATED (e.g. MEDIUM -> HIGH -> CRITICAL),
  // not ALERT_NEW, so they need their own handler + severity-aware dedupe.
  const handleAlertUpdate = useCallback((payload) => {
    const data = payload?.data || payload;
    if (!shouldNotifyUpdate(data)) return;
    showAlert({
      id: alertUpdateDedupeId(data),
      severity: escalationTargetSeverity(data),
      data,
    });
  }, [showAlert]);

  // Subscribe to MEDIUM/HIGH/CRITICAL alert events.
  useEffect(() => {
    const offNew = subscribe(SOCKET_EVENTS.ALERT_NEW, handleAlert);
    const offUpdated = subscribe(SOCKET_EVENTS.ALERT_UPDATED, handleAlertUpdate);
    return () => {
      offNew();
      offUpdated();
    };
  }, [subscribe, handleAlert, handleAlertUpdate]);

  // Also unlock audio on any user interaction (click/keydown) as a fallback.
  useEffect(() => {
    const tryUnlock = () => unlockAudio();
    window.addEventListener("click", tryUnlock, { once: true, capture: true });
    window.addEventListener("keydown", tryUnlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("click", tryUnlock, { capture: true });
      window.removeEventListener("keydown", tryUnlock, { capture: true });
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed left-1/2 top-4 z-[2000] flex -translate-x-1/2 flex-col gap-3 pointer-events-none"
         style={{ maxWidth: "min(440px, calc(100vw - 2rem))", width: "100%" }}>
      {alerts.map((a) => {
        const s = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.HIGH;
        return (
          <div
            key={a.id}
            className={`pointer-events-auto relative overflow-hidden rounded-xl border-l-4 ${s.border} ${s.bg} shadow-xl animate-[alertSlideDown_0.3s_ease-out]`}
            role="alert"
            aria-live="assertive"
          >
            <span className={`absolute left-0 top-0 h-full w-1 ${s.pulse} animate-pulse`} />

            <div className="flex items-start gap-3 pl-4 pr-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${s.badge}`}>
                    {a.severity} ALERT
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {a.cameraCode}
                  </span>
                </div>
                <p className={`text-sm font-semibold ${s.text} truncate`}>
                  {eventLabel(a.eventType)}
                </p>
                {a.reason && (
                  <p className={`text-xs mt-0.5 ${s.sub} truncate`}>{formatEventLabel(a.reason)}</p>
                )}
                {a.riskScore != null && !a.reason && (
                  <p className={`text-xs mt-0.5 ${s.sub}`}>
                    Risk Score: {a.riskScore}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    dismiss(a.id);
                    navigate(`/alerts/${a.id}`);
                  }}
                  className="btn-focus inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap"
                  title="View Alert"
                >
                  <ExternalLinkIcon size={12} /> View
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(a.id)}
                  className="btn-focus rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label="Dismiss alert"
                >
                  <XIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
