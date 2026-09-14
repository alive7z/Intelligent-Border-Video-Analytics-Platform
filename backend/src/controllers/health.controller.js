const env = require("../config/env");
const { getPool } = require("../config/database");
const { sendSuccess, sendError } = require("../utils/ApiResponse");
const alertManager = require("../services/alertManager.service");
const redis = require("../config/redis");
const http = require("http");
const https = require("https");

// Phase 56 — Probe the AI engine health endpoint so /api/health distinguishes
// Backend / Database / Redis / AI / per-camera status without one camera (or
// the AI service) taking the whole system down. Never throws: misconfigured or
// unreachable AI degrades to a status instead of failing the response.
const probeAiHealth = () => {
  const base = String(env.AI_INTERNAL_URL || "").replace(/\/+$/, "");
  if (!base) {
    return Promise.resolve({ status: "NOT_CONFIGURED", cameras: null, error: null });
  }
  const target = new URL(`${base}/health`);
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const req = transport.get(target, { timeout: 1200 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 65536) req.destroy();
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          const cameras = data.cameras || null;
          const summary = cameras
            ? Object.fromEntries(
                Object.entries(cameras).map(([code, c]) => [
                  code,
                  {
                    status: c?.stream?.status || c?.status || "UNKNOWN",
                    streamSessionId: c?.stream?.streamSessionId || null,
                    decodedFps: c?.stream?.decodedFps ?? null,
                    processingFps: c?.stream?.processingFps ?? null,
                    previewFps: c?.stream?.previewFps ?? null,
                    reconnectAttempts: c?.stream?.reconnectAttempts ?? null,
                  },
                ])
              )
            : null;
          done({ status: data.status || "ONLINE", cameras: summary, error: null });
        } catch {
          done({ status: "UNKNOWN", cameras: null, error: "invalid response" });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      done({ status: "UNREACHABLE", cameras: null, error: "timeout" });
    });
    req.on("error", (err) => {
      done({ status: "UNREACHABLE", cameras: null, error: err.code || "error" });
    });
  });
};

const getHealth = async (req, res) => {
  let databaseStatus = "disconnected";

  try {
    await getPool().query("SELECT 1");
    databaseStatus = "connected";
  } catch (err) {
    databaseStatus = "disconnected";
  }

  const redisEnabled = redis.isEnabled();
  const ai = await probeAiHealth();
  const data = {
    service: "IBVAP API",
    status: "healthy",
    environment: env.NODE_ENV,
    connectivity: {
      localApi: "AVAILABLE",
      localDatabase: databaseStatus,
      ai: ai.status,
      hqSynchronization: "NOT_ACTIVE",
      hqReason: "No external synchronization endpoint configured",
    },
    database: {
      status: databaseStatus,
    },
    ai: {
      status: ai.status,
      error: ai.error,
      cameras: ai.cameras,
    },
    redis: {
      enabled: redisEnabled,
      status: redisEnabled
        ? redis.isHealthy()
          ? "healthy"
          : "degraded"
        : "disabled",
    },
    preview: {
      enabled: env.PREVIEW_ENABLED,
    },
    alertManager: {
      enabled: true,
      status: "READY",
      minSeverity: alertManager.policy().minSeverity,
      minRiskScore: alertManager.policy().minRiskScore,
      dedupWindowSeconds: alertManager.policy().dedupWindowSeconds,
      metrics: alertManager.getMetrics(),
    },
    evidence: {
      enabled: env.EVIDENCE_ENABLED,
      status: env.EVIDENCE_ENABLED ? "READY" : "DISABLED",
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  if (databaseStatus === "disconnected") {
    return sendError(res, 503, "IBVAP Backend running, but database is unavailable", null);
  }

  return sendSuccess(res, 200, "IBVAP Backend is running", data);
};

module.exports = { getHealth };
