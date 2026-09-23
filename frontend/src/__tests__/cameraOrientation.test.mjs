import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDisplayRotationDegrees,
  normalizeDisplayRotation,
  getDisplayRotationMediaStyle,
} from "../utils/cameraOrientation.js";

test("getDisplayRotationDegrees returns a safe number", () => {
  assert.equal(getDisplayRotationDegrees(null), 0);
  assert.equal(getDisplayRotationDegrees({}), 0);
  assert.equal(getDisplayRotationDegrees({ displayRotationDegrees: -90 }), -90);
  assert.equal(getDisplayRotationDegrees({ displayRotationDegrees: 180 }), 180);
  assert.equal(getDisplayRotationDegrees({ displayRotationDegrees: "abc" }), 0);
});

test("normalizeDisplayRotation maps any angle to [0, 360)", () => {
  assert.equal(normalizeDisplayRotation(0), 0);
  assert.equal(normalizeDisplayRotation(90), 90);
  assert.equal(normalizeDisplayRotation(180), 180);
  assert.equal(normalizeDisplayRotation(270), 270);
  assert.equal(normalizeDisplayRotation(-90), 270);
  assert.equal(normalizeDisplayRotation(-270), 90);
  assert.equal(normalizeDisplayRotation(360), 0);
  assert.equal(normalizeDisplayRotation(-360), 0);
  assert.equal(normalizeDisplayRotation(450), 90);
  assert.equal(normalizeDisplayRotation("abc"), 0);
  assert.equal(normalizeDisplayRotation(null), 0);
});

test("getDisplayRotationMediaStyle returns null when no rotation is applied", () => {
  assert.equal(getDisplayRotationMediaStyle({}), null);
  assert.equal(getDisplayRotationMediaStyle({ displayRotationDegrees: 0 }), null);
  assert.equal(
    getDisplayRotationMediaStyle({ displayRotationDegrees: "not-a-number" }),
    null
  );
});

test("90/270 stored values do not rotate the already-canonical browser frame", () => {
  assert.equal(getDisplayRotationMediaStyle({ displayRotationDegrees: 90 }), null);
  assert.equal(getDisplayRotationMediaStyle({ displayRotationDegrees: -90 }), null);
});

test("180 stored value does not rotate the already-canonical browser frame", () => {
  assert.equal(getDisplayRotationMediaStyle({ displayRotationDegrees: 180 }), null);
});

test("documented dashboard orientation: CAM-01 180deg, CAM-02 -90deg (landscape-left)", () => {
  assert.equal(getDisplayRotationDegrees({ displayRotationDegrees: 180 }), 180);
  assert.equal(normalizeDisplayRotation(180), 180);
  assert.equal(getDisplayRotationDegrees({ displayRotationDegrees: -90 }), -90);
  assert.equal(normalizeDisplayRotation(-90), 270);
});
