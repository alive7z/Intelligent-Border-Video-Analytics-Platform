import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getMinCardWidth,
  getLiveGridTemplate,
  getSingleCameraMaxWidth,
  shouldCenterSingleCamera,
} from "../utils/overviewGrid.js";

test("getMinCardWidth keeps cards readable on every breakpoint", () => {
  assert.equal(getMinCardWidth(true), 340);
  assert.equal(getMinCardWidth(false), 280);
});

test("getLiveGridTemplate builds an auto-fit track list", () => {
  assert.equal(
    getLiveGridTemplate(true),
    "repeat(auto-fit, minmax(340px, 1fr))"
  );
  assert.equal(
    getLiveGridTemplate(false),
    "repeat(auto-fit, minmax(280px, 1fr))"
  );
});

test("single camera is capped and centered, never edge-to-edge", () => {
  assert.equal(getSingleCameraMaxWidth(), 740);
  assert.equal(shouldCenterSingleCamera(0), false);
  assert.equal(shouldCenterSingleCamera(1), true);
  assert.equal(shouldCenterSingleCamera(2), false);
  assert.equal(shouldCenterSingleCamera(20), false);
});