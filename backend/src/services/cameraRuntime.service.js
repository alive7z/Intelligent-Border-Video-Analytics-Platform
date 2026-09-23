const http = require("http");
const https = require("https");
const { URL } = require("url");
const cameraRepository = require("../repositories/camera.repository");
const cameraService = require("./camera.service");
const redis = require("../config/redis");
const env = require("../config/env");

// Fallback live source of truth when the optional Redis cache is unavailable.
// Python is the live authority for whether a stream is actually ONLINE; reading
// its /health here is graceful degradation, never MySQL corruption, and the
// payload below never contains stream_url/credentials.
const runtimeFromHealthPayload = (parsed, cameraCode) => {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.cameras && typeof parsed.cameras === "object") {
    const cameraHealth = parsed.cameras[cameraCode];
    if (!cameraHealth || typeof cameraHealth !== "object") return null;
    parsed = cameraHealth;
  }
  const stream = parsed.stream && typeof parsed.stream === "object" ? parsed.stream : {};
  const video = parsed.videoSource && typeof parsed.videoSource === "object"
    ? parsed.videoSource
    : {};

  // /health exposes the camera identity at the top level and richer transport
  // metadata under stream. Accept either shape, but never cross camera IDs.
  const reportedCameraCode = parsed.cameraCode || stream.cameraCode;
  if (reportedCameraCode !== cameraCode) return null;

  // Stream metadata refreshes on a heartbeat; videoSource is read directly
  // from StreamHealth and is therefore the freshest status/counter source.
  const status = video.status || stream.status;
  if (!status) return null;

  return {
    status,
    sourceType: stream.sourceType || video.sourceType || null,
    protocol: stream.protocol || null,
    streamSessionId: stream.streamSessionId || null,
    reconnectAttempts: stream.reconnectAttempts || 0,
    currentBackoffSeconds: stream.currentBackoffSeconds || 0,
    lastFrameAt: stream.lastFrameAt || video.lastFrameTimestamp || null,
    framesRead: video.framesRead || 0,
    framesProcessed: video.framesProcessed || 0,
    decodedFps: video.decodedFps || null,
    processingFps: video.processingFps || null,
    previewFps: video.previewFps || null,
    lastFrameAgeMs: video.lastFrameAgeMs ?? null,
    droppedStaleFrames: video.droppedStaleFrames || 0,
    consecutiveReadFailures: video.consecutiveReadFailures || 0,
    reconnectCount: video.reconnectCount || 0,
    cameraQuality: safeCameraQuality(stream.cameraQuality || video.cameraQuality),
    adaptiveProcessing: safeAdaptiveProcessing(stream.adaptiveProcessing),
    lastHeartbeatAt: stream.lastHeartbeatAt || null,
  };
};

const safeAdaptiveProcessing = (value) => {
  if (!value || typeof value !== "object") return null;
  const safe = { enabled: Boolean(value.enabled), tasks: {} };
  for (const key of ["budgetFraction", "maxFrameAgeMs", "queueDepth"]) {
    if (Number.isFinite(value[key]) && value[key] >= 0) safe[key] = value[key];
  }
  for (const name of ["anpr", "face"]) {
    const task = value.tasks?.[name];
    if (!task || typeof task !== "object") continue;
    safe.tasks[name] = {};
    for (const key of ["latencyMs", "runs", "skipped"]) {
      if (Number.isFinite(task[key]) && task[key] >= 0) safe.tasks[name][key] = task[key];
    }
    safe.tasks[name].lastSkipReason = ["STALE_FRAME", "MEASURED_COST_COOLDOWN"].includes(task.lastSkipReason) ? task.lastSkipReason : null;
  }
  return safe;
};

const safeCameraQuality = (quality) => {
  if (!quality || typeof quality !== "object") return null;
  const safe = {};
  for (const key of ["status", "brightnessStatus", "measuredAt"]) {
    if (typeof quality[key] === "string") safe[key] = quality[key].slice(0, 80);
  }
  for (const key of ["sharpness", "brightness", "width", "height"]) {
    if (Number.isFinite(quality[key])) safe[key] = quality[key];
  }
  safe.reasons = Array.isArray(quality.reasons)
    ? quality.reasons.filter((reason) => typeof reason === "string").slice(0, 10).map((reason) => reason.slice(0, 80))
    : [];
  return safe;
};

const fetchPythonRuntime = (cameraCode) =>
  new Promise((resolve) => {
    let upstreamUrl;
    try {
      upstreamUrl = new URL(env.AI_INTERNAL_URL);
    } catch (e) {
      return resolve(null);
    }
    const lib = upstreamUrl.protocol === "https:" ? https : http;
    const req = lib.get(
      {
        host: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
        path: "/health",
        timeout: 2500,
        headers: { Accept: "application/json" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 65536) res.destroy();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve(runtimeFromHealthPayload(parsed, cameraCode));
            return;
          } catch (e) {
            // fall through
          }
          resolve(null);
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });

// Merge ephemeral runtime state (Redis — or the AI engine when the optional
// Redis cache is down) with the DB camera row into a SAFE status payload.
// Explicitly excludes stream_url/credentials — never exposed publicly.
const runtimeStatusForCamera = async (cameraCode) => {
  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera || camera.deleted_at) return null;

  let runtime = await redis.getCameraRuntime(cameraCode);
  const redisAvailable = redis.isEnabled() && redis.isHealthy();

  // Redis is only a cache within its TTL, never the source of truth. A cached
  // ONLINE heartbeat is trusted as long as it is unexpired (Python wrote it and
  // would report the same). A cached NON-ONLINE status (CONNECTING/RECONNECTING/
  // OFFLINE/...) must NOT be trusted — it can be stale within its TTL and does
  // not reflect what is happening right now — so always re-ask the AI engine,
  // the live authority. If the AI is unreachable and the only evidence is a
  // stale non-ONLINE entry, surface nothing rather than a fake state.
  const cachedStatus = String(runtime?.status || "").toUpperCase();
  if (cachedStatus === "ONLINE") {
    // Trusted until it expires; already validated shape by redis.getCameraRuntime.
  } else {
    const pythonRuntime = await fetchPythonRuntime(cameraCode);
    if (pythonRuntime) {
      runtime = pythonRuntime;
    } else if (cachedStatus) {
      // No live authority and no confirmed ONLINE — never present a stale
      // cache value (e.g. CONNECTING from an earlier attempt) as reality.
      runtime = null;
    }
  }

  const live = String(runtime?.status || "").toUpperCase() === "ONLINE";

  return {
    ...cameraService.toSafeCamera(camera),
    live,
    runtime: runtime
      ? {
          status: runtime.status || null,
          sourceType: runtime.sourceType || null,
          protocol: runtime.protocol || null,
          streamSessionId: runtime.streamSessionId || null,
          lastSessionId: runtime.lastSessionId || null,
          sessionChanged: Boolean(runtime.sessionChanged),
          reconnectAttempts: runtime.reconnectAttempts || 0,
          currentBackoffSeconds: runtime.currentBackoffSeconds || 0,
          lastFrameAt: runtime.lastFrameAt || runtime.lastFrameTimestamp || null,
          framesRead: runtime.framesRead || 0,
          framesProcessed: runtime.framesProcessed || 0,
          decodedFps: runtime.decodedFps || null,
          processingFps: runtime.processingFps || null,
          previewFps: runtime.previewFps || null,
          lastFrameAgeMs: runtime.lastFrameAgeMs ?? null,
          droppedStaleFrames: runtime.droppedStaleFrames || 0,
          consecutiveReadFailures: runtime.consecutiveReadFailures || 0,
          reconnectCount: runtime.reconnectCount || 0,
          cameraQuality: safeCameraQuality(runtime.cameraQuality),
          adaptiveProcessing: safeAdaptiveProcessing(runtime.adaptiveProcessing),
          lastHeartbeatAt: runtime.lastHeartbeatAt || null,
        }
      : null,
    redisAvailable,
  };
};

// Bulk runtime map keyed by cameraCode (Redis) — used to annotate camera lists.
const getAllRuntimeAsync = async () => redis.getAllRuntime();

module.exports = {
  runtimeStatusForCamera,
  getAllRuntimeAsync,
  fetchPythonRuntime,
  runtimeFromHealthPayload,
};
