const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

const DEFAULT_EXPIRES_IN = "8h";
const SIGN_ALGORITHM = "HS256";

const getSecret = (secretOverride) => secretOverride || env.JWT.SECRET;

// Items explicitly NOT part of the payload are never signed.
const signOptions = () => ({
  algorithm: SIGN_ALGORITHM,
  issuer: env.JWT.ISSUER,
  audience: env.JWT.AUDIENCE,
  jwtid: crypto.randomUUID(),
});

const generateAccessToken = (payload, options = {}) => {
  const secret = getSecret(options.secret);
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  const expiresIn = options.expiresIn || env.JWT.EXPIRES_IN || DEFAULT_EXPIRES_IN;
  const claims = { ...payload };
  if (options.mfaChallenge) {
    claims.purpose = "mfa_challenge";
    claims.mfaSecret = options.mfaSecret || null;
  } else {
    claims.tkver = options.tokenVersion ?? null;
  }
  return jwt.sign(claims, secret, { ...signOptions(), expiresIn });
};

const verifyAccessToken = (token, options = {}) => {
  const secret = getSecret(options.secret);
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  // Algorithm pinning: only HS256 JWT are accepted (B1). Tokens issued before
  // this hardening carry no jti — that is tolerated; revocation applies only
  // when a jti is present.
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (options.requireIssuerAudience && (decoded.iss || decoded.aud)) {
    if (decoded.iss !== env.JWT.ISSUER) throw new Error("invalid issuer");
    if (decoded.aud !== env.JWT.AUDIENCE) throw new Error("invalid audience");
  }
  return decoded;
};

module.exports = { generateAccessToken, verifyAccessToken, SIGN_ALGORITHM };