import { test } from "node:test";
import assert from "node:assert/strict";
import {
  liveRuntimeStatus,
  databaseStatus,
  mergeRuntimeCamera,
  fromSocketCamera,
} from "../utils/cameraStatus.js";

const base = (over = {}) => ({
  id: "CAM-03",
  cameraCode: "CAM-03",
  name: "Camera 03",
  status: "offline",
  streamStatus: "CONNECTING",
  enabled: true,
  ...over,
});

const runtimePayload = (runtime, over = {}) => ({
  camera: {
    cameraCode: "CAM-03",
    name: "Camera 03",
    streamStatus: "CONNECTING",
    enabled: true,
    live: Boolean(runtime && runtime.status === "ONLINE"),
    runtime,
    ...over,
  },
});

test("liveRuntimeStatus only reports online/connecting/degraded from a runtime payload", () => {
  assert.equal(liveRuntimeStatus("ONLINE"), "online");
  assert.equal(liveRuntimeStatus("CONNECTING"), "connecting");
  assert.equal(liveRuntimeStatus("DEGRADED"), "degraded");
  assert.equal(liveRuntimeStatus("RECONNECTING"), "offline");
  assert.equal(liveRuntimeStatus("OFFLINE"), "offline");
  assert.equal(liveRuntimeStatus("ERROR"), "offline");
  assert.equal(liveRuntimeStatus("NOT_CONFIGURED"), "offline");
  assert.equal(liveRuntimeStatus(null), "offline");
});

test("databaseStatus never turns a recorded CONNECTING row into a live attempt", () => {
  assert.equal(databaseStatus("CONNECTING", true), "offline");
  assert.equal(databaseStatus("RECONNECTING", true), "offline");
  assert.equal(databaseStatus("OFFLINE", true), "offline");
  assert.equal(databaseStatus("ONLINE", true), "online");
  assert.equal(databaseStatus("ONLINE", false), "offline");
});

test("mergeRuntimeCamera: DB CONNECTING with no runtime renders offline", () => {
  const merged = mergeRuntimeCamera(base(), runtimePayload(null));
  assert.equal(merged.status, "offline");
});

test("mergeRuntimeCamera: DB CONNECTING with a confirmed OFFLINE runtime renders offline", () => {
  const merged = mergeRuntimeCamera(
    base(),
    runtimePayload({ status: "OFFLINE", lastFrameAt: null })
  );
  assert.equal(merged.status, "offline");
});

test("mergeRuntimeCamera: a genuine runtime CONNECTING attempt renders connecting", () => {
  const merged = mergeRuntimeCamera(
    base(),
    runtimePayload({ status: "CONNECTING" }, { live: false })
  );
  assert.equal(merged.status, "connecting");
});

test("mergeRuntimeCamera: a runtime ONLINE stream renders online", () => {
  const merged = mergeRuntimeCamera(
    base({ status: "offline" }),
    runtimePayload({ status: "ONLINE", lastFrameAt: "2026-09-23T10:00:00.000Z" })
  );
  assert.equal(merged.status, "online");
  assert.equal(merged.live, true);
});

test("mergeRuntimeCamera: a RECONNECTING runtime surfaces as offline (never stuck connecting)", () => {
  const merged = mergeRuntimeCamera(
    base(),
    runtimePayload({ status: "RECONNECTING" }, { live: false })
  );
  assert.equal(merged.status, "offline");
});

test("mergeRuntimeCamera: DB ONLINE without a runtime payload stays online", () => {
  const merged = mergeRuntimeCamera(
    base({ streamStatus: "ONLINE", status: "online" }),
    {
      camera: {
        cameraCode: "CAM-03",
        streamStatus: "ONLINE",
        enabled: true,
        live: false,
        runtime: null,
      },
    }
  );
  assert.equal(merged.status, "online");
});

test("mergeRuntimeCamera: disabled cameras are always offline", () => {
  const merged = mergeRuntimeCamera(
    base({ enabled: false }),
    runtimePayload({ status: "ONLINE" }, { enabled: false, live: false })
  );
  assert.equal(merged.status, "offline");
});

test("fromSocketCamera: a socket-pushed DB CONNECTING row never renders connecting", () => {
  const cam = fromSocketCamera({
    cameraCode: "CAM-03",
    name: "Camera 03",
    streamStatus: "CONNECTING",
    enabled: true,
  });
  assert.equal(cam.status, "offline");
});

test("fromSocketCamera: only an explicitly ONLINE row renders online", () => {
  assert.equal(
    fromSocketCamera({ cameraCode: "C", streamStatus: "ONLINE", enabled: true })
      .status,
    "online"
  );
  assert.equal(
    fromSocketCamera({ cameraCode: "C", streamStatus: "OFFLINE", enabled: true })
      .status,
    "offline"
  );
  assert.equal(
    fromSocketCamera({ cameraCode: "C", streamStatus: "ONLINE", enabled: false })
      .status,
    "offline"
  );
});
