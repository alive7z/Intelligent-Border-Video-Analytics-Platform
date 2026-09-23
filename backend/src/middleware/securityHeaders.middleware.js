"use strict";

const env = require("../config/env");

// Additive security headers on top of helmet() defaults (B18). CSP must stay
// permissive enough for browser previews (MJPEG via <img>, WebSocket for
// Socket.IO) and the map tileset without reintroducing unsafe-inline JS.

// Preview/backend origin for frame/img/connect sources.
const BACKEND_ORIGIN = env.FRONTEND_BACKEND_URL || "http://localhost:5001";

const securityHeaders = (req, res, next) => {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http://localhost:5001",
    "connect-src 'self' ws: wss: http://localhost:5001",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (env.isProduction() && env.ENABLE_HSTS === "true") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return next();
};

module.exports = securityHeaders;