"use strict";

const crypto = require("crypto");
const fs = require("fs");
const env = require("../config/env");

// Optional production-mode mutual-TLS for edge-node service calls (B24).
// When MTLS_ENABLED=true only requests presenting a client certificate signed
// by the configured trusted CA are accepted. Local development keeps
// MTLS_ENABLED=false and this middleware is a transparent pass-through.
//
// A separate AI↔backend path already authenticates by shared service token
// (zero-trust B25); mTLS adds transport-level client-identity verification on
// top. NEVER commit CA/node private keys.

let _ca = null;
const loadCa = () => {
  if (_ca) return _ca;
  const caPath = env.MTLS_CA_CERT;
  if (!caPath) return null;
  _ca = new crypto.X509Certificate(fs.readFileSync(caPath));
  return _ca;
};

const mtls = (req, res, next) => {
  if (!env.MTLS_ENABLED) return next();
  const cert = req.socket.getPeerCertificate();
  if (!cert || !cert.raw || !cert.subject) {
    return res.status(401).json({ success: false, message: "mTLS client certificate required", errors: ["mTLS_CLIENT_CERT_REQUIRED"] });
  }
  const ca = loadCa();
  if (!ca) {
    return res.status(503).json({ success: false, message: "mTLS enabled but MTLS_CA_CERT is missing", errors: ["MTLS_NOT_CONFIGURED"] });
  }
  try {
    const peer = new crypto.X509Certificate(cert.raw);
    if (!peer.checkIssued(ca)) {
      return res.status(401).json({ success: false, message: "mTLS client certificate not signed by trusted CA", errors: ["mTLS_CA_UNTRUSTED"] });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: "mTLS verification error", errors: [`mTLS_VERIFY_ERROR:${err.message}`] });
  }
  return next();
};

module.exports = mtls;