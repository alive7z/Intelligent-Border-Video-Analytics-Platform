"""No optional-work queue: skip stale frames and cool down measured costly jobs.

Never changes core detection/risk thresholds. Individual native/OCR calls are
not preemptible; this is secondary duty scheduling, not a realtime guarantee.
"""
import time
from config import ADAPTIVE_SECONDARY_ENABLED, SECONDARY_BUDGET_FRACTION, SECONDARY_MAX_FRAME_AGE_MS


class SecondaryScheduler:
    def __init__(self, enabled=ADAPTIVE_SECONDARY_ENABLED, budget_fraction=SECONDARY_BUDGET_FRACTION,
                 max_frame_age_ms=SECONDARY_MAX_FRAME_AGE_MS):
        self.enabled = enabled
        self.budget = max(0.05, min(0.5, budget_fraction))
        self.max_age = max_frame_age_ms
        self.tasks = {name: {"nextAt": 0.0, "latencyMs": 0.0, "runs": 0, "skipped": 0,
                             "confirmUntil": 0.0, "confirmRetries": 0,
                             "lastSkipReason": None} for name in ("anpr", "face")}

    def allow(self, task, frame_age_ms, now=None, pending_confirmation=False):
        now = time.monotonic() if now is None else now
        state = self.tasks[task]
        reason = None
        if self.enabled:
            if frame_age_ms > self.max_age:
                reason = "STALE_FRAME"
            elif now < state["nextAt"]:
                if pending_confirmation and now < state["confirmUntil"] and state["confirmRetries"] > 0:
                    state["confirmRetries"] -= 1
                else:
                    reason = "MEASURED_COST_COOLDOWN"
        if not reason and now >= state["nextAt"]:
            # Reserve at most two prompt retries for uncertain plate consensus.
            state["confirmUntil"] = now + 2.0
            state["confirmRetries"] = 2 if task == "anpr" else 0
        if reason:
            state["skipped"] += 1
            state["lastSkipReason"] = reason
            return False
        state["lastSkipReason"] = None
        return True

    def record(self, task, latency_ms, now=None):
        now = time.monotonic() if now is None else now
        state = self.tasks[task]
        latency_ms = max(0.0, latency_ms)
        state["latencyMs"] = latency_ms if not state["runs"] else 0.25 * latency_ms + 0.75 * state["latencyMs"]
        state["runs"] += 1
        wait = min(10.0, max(0.1, state["latencyMs"] / 1000 * (2 / self.budget - 1)))
        state["nextAt"] = now + wait

    def snapshot(self):
        return {"enabled": self.enabled, "budgetFraction": self.budget,
                "maxFrameAgeMs": self.max_age, "queueDepth": 0,
                "tasks": {name: {k: v for k, v in state.items() if k not in {"nextAt", "confirmUntil", "confirmRetries"}}
                          for name, state in self.tasks.items()}}
