"""One bounded OCR window per vehicle; no persistence of intermediate reads.

The owning manager belongs to one camera/session and is reset on reconnect.
Only crops that passed quality gates consume a sample, including unreadable
OCR results. Invalid reads must not grant an unlimited retry budget.
"""
from dataclasses import dataclass, field

from anpr.validator import is_confirmed
from anpr.normalize import supports_observed_registration


@dataclass
class SampleWindow:
    first_at: float
    last_seen: float
    samples: list = field(default_factory=list)
    finalized: bool = False
    status: str = "COLLECTING"


class PlateSampleWindows:
    def __init__(self, target=3, maximum=3, seconds=2.0, minimum_confidence=0.6,
                 confirm_reads=2, retention_seconds=60):
        self.target = max(1, min(3, int(target)))
        self.maximum = max(self.target, min(3, int(maximum)))
        self.seconds = max(0.1, float(seconds))
        self.minimum_confidence = minimum_confidence
        self.confirm_reads = max(1, int(confirm_reads))
        self.retention = retention_seconds
        self.states = {}

    def reset(self):
        self.states.clear()

    def finalized(self, track_id):
        state = self.states.get(track_id)
        return bool(state and state.finalized)

    def pending(self):
        return any(not state.finalized for state in self.states.values())

    def touch(self, active_ids, now):
        for tid in active_ids:
            if tid in self.states:
                self.states[tid].last_seen = now
        for tid, state in list(self.states.items()):
            if tid not in active_ids and now - state.last_seen > self.retention:
                del self.states[tid]

    @staticmethod
    def quality(candidate):
        return candidate.ocr_confidence * (0.5 + 0.5 * candidate.quality_score) * (0.5 + 0.5 * candidate.plate_detection_confidence)

    def _select(self, state):
        groups = {}
        for candidate in state.samples:
            if is_confirmed(candidate.normalized_text, candidate.ocr_confidence, self.minimum_confidence):
                groups.setdefault(candidate.normalized_text, []).append(candidate)
        if not groups:
            return None
        # An ambiguous read can support exactly one independently observed
        # valid text; it can never invent the target or supply its evidence.
        support = {text: list(group) for text, group in groups.items()}
        for candidate in state.samples:
            if candidate.normalized_text in groups or not self.minimum_confidence <= candidate.ocr_confidence <= 1:
                continue
            matches = [text for text in groups if supports_observed_registration(candidate.normalized_text, text)]
            if len(matches) == 1:
                support[matches[0]].append(candidate)
        ranked = sorted(groups, key=lambda text: (len(support[text]), sum(map(self.quality, support[text]))), reverse=True)
        winner = support[ranked[0]]
        # Equally supported conflicting registrations are not a confirmation.
        if len(ranked) > 1 and len(winner) == len(support[ranked[1]]):
            return None
        # Prefer the later frame on an exact quality tie; it carries the most
        # recent tracker metadata (for example the resolved vehicle subtype).
        best = max(groups[ranked[0]], key=lambda candidate: (self.quality(candidate), candidate.observed_at))
        if len(winner) < self.confirm_reads:
            # A departed vehicle may leave just one very good, valid read.
            if len(state.samples) != 1 or best.ocr_confidence < 0.90 or best.quality_score < 0.65:
                return None
        return best, len(winner)

    def finish(self, track_id):
        state = self.states.get(track_id)
        if state is None or state.finalized:
            return None
        selected = self._select(state)
        state.finalized = True
        state.status = "CONFIRMED" if selected else "NOT_CONFIRMED"
        state.samples.clear()  # release all losing crops immediately
        return selected

    def add(self, track_id, candidate, now):
        state = self.states.setdefault(track_id, SampleWindow(now, now))
        if state.finalized:
            return None
        state.last_seen = now
        # Legibility extension: while this vehicle's crop keeps improving (a
        # larger/clearer plate than every prior sample — e.g. a vehicle slowly
        # approaching the camera), re-anchor the window so the plate is still
        # read once it becomes legible, instead of finalizing on the first
        # unreadable frames. The window stays bounded: finalize on departure,
        # on reaching the sample maximum, or once no better crop appears.
        prior_best = max((c.quality_score for c in state.samples), default=0.0)
        if candidate.quality_score > prior_best:
            state.first_at = now
        if now - state.first_at >= self.seconds and state.samples:
            return self.finish(track_id)
        candidate.observed_at = now
        state.samples.append(candidate)
        # Finalize as soon as consensus is genuinely satisfied; otherwise use
        # no more than three candidates before making the best available call.
        if len(state.samples) >= self.maximum or (
            len(state.samples) >= self.confirm_reads and self._select(state)
        ):
            return self.finish(track_id)
        return None

    def flush(self, active_ids, now):
        results = []
        for tid, state in self.states.items():
            if not state.finalized and (tid not in active_ids or now - state.first_at >= self.seconds):
                selected = self.finish(tid)
                if selected:
                    results.append((tid, selected))
        self.touch(active_ids, now)
        return results
