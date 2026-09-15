const ApiError = require("../utils/ApiError");
const jwtUtil = require("../utils/jwt");
const userRepository = require("../repositories/user.repository");
const integrityRepository = require("../repositories/integrity.repository");
const sessionStore = require("../security/session");
const metrics = require("../security/metrics");

const extractBearerToken = (req) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token.trim();
};

const authenticate = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    return next(new ApiError(401, "Authentication required"));
  }

  let payload;
  try {
    payload = jwtUtil.verifyAccessToken(token);
  } catch (err) {
    metrics.incInvalidTokens();
    return next(new ApiError(401, "Invalid or expired token"));
  }

  if (payload.purpose === "mfa_challenge") {
    return next(new ApiError(401, "MFA challenge complete; sign in with the full token"));
  }

  // Token revocation (B10): reject jti present in the revocation store.
  if (payload.jti) {
    const revoked = sessionStore.isRevoked(payload.jti);
    if (revoked) {
      metrics.incInvalidTokens();
      return next(new ApiError(401, "Token has been revoked"));
    }
    try {
      const dbRevoked = await integrityRepository.findRevocation(payload.jti);
      if (dbRevoked) {
        sessionStore.revokeJti(payload.jti);
        metrics.incInvalidTokens();
        return next(new ApiError(401, "Token has been revoked"));
      }
    } catch (err) {
      // Best-effort: DB revocation lookups must never break auth in a degraded env.
    }
  }

  const user = await userRepository.findUserById(payload.userId);

  if (!user) {
    metrics.incInvalidTokens();
    return next(new ApiError(401, "User no longer exists"));
  }

  if (user.status !== "ACTIVE") {
    return next(new ApiError(403, "Account is not active"));
  }

  // Password/security-versioned tokens: if the token carries tkver, it must
  // match the user's current token_version (password change / session bump).
  if (payload.tkver != null && Number(payload.tkver) !== Number(user.token_version || 0)) {
    metrics.incInvalidTokens();
    return next(new ApiError(401, "Token version revoked (credentials changed)"));
  }

  req.user = {
    publicId: user.public_id,
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  };
  req.tokenPayload = payload;

  return next();
};

module.exports = { authenticate, extractBearerToken };