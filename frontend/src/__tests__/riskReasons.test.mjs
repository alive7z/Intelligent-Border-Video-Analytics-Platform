import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRiskReasons } from "../utils/riskReasons.mjs";
import { incidentTimeline } from "../utils/incidentTimeline.mjs";

test("legacy reason codes remain visible without invented contributions", () => {
  assert.deepEqual(mapRiskReasons({ reasons: ["FENCE_CROSSING"] }), [{ code: "FENCE_CROSSING", label: "FENCE CROSSING", score: null }]);
  assert.deepEqual(mapRiskReasons(null), []);
});
test("rule weights are not mislabeled as additive score contributions", () => {
  assert.equal(mapRiskReasons({ reasonDetails: [{ code: "NIGHT_MOVEMENT", weight: 3 }] })[0].score, null);
  assert.equal(mapRiskReasons({ reasonDetails: [{ code: "NIGHT_MOVEMENT", contribution: 12 }] })[0].score, 12);
});

test("incident timelines never invent unrecorded detection or lifecycle stages", () => {
  assert.deepEqual(incidentTimeline({}), []);
  assert.deepEqual(incidentTimeline({ created_at: "2026-09-11T00:00:00Z", resolved_at: "invalid" }),
    [{ time: "2026-09-11T00:00:00Z", event: "Alert created" }]);
});
