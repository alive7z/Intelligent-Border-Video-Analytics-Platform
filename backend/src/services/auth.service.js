const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const jwtUtil = require("../utils/jwt");
const { comparePassword } = require("../utils/password");
const { toSafeUser } = require("../utils/userSerializer");
const userRepository = require("../repositories/user.repository");
const mfaRepository = require("../repositories/mfa.repository");
const integrityRepository = require("../repositories/integrity.repository");
const realtimeService = require("../realtime/realtime.service");
const auditService = require("./audit.service");
const mfa = require("../security/mfa");
const metrics = require("../security/metrics");
const securityEvents = require("../security/securityEvents.service");
const sessionStore = require("../security/session");

const normalizeEmail = (email) => {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
};

const auditLogin = async ({ userId, success, ipAddress, email, details }) => {
  try {
    await userRepository.auditInsert({
      userId,
      action: success ? "LOGIN" : "LOGIN_FAILED",
      entityType: "user",
      entityId: userId ? String(userId) : null,
      details: { email, ...details },
      ipAddress,
    });
  } catch (err) {
    // Audit logging must never break authentication.
  }
};

// ─── Brute-force / lockout (B8/B9) ────────────────────────────────────────

const recordFailedLogin = async ({ user, ipAddress, email }) => {
  const now = new Date();
  const threshold = env.LOGIN_LOCKOUT_THRESHOLD || 5;
  const lockMinutes = env.LOGIN_LOCKOUT_MINUTES || 15;
  const attempts = (user && user.failed_login_attempts || 0) + 1;
  const lockedUntil = attempts >= threshold ? new Date(now.getTime() + lockMinutes * 60 * 1000) : null;
  await userRepository.recordFailedAttempt({ userId: user ? user.id : null, email, attempts, lockedUntil });
  await auditLogin({ userId: user ? user.id : null, success: false, ipAddress, email });
  if (attempts >= threshold && user && user.id) {
    await securityEvents.recordSecurityEvent({ action: "BRUTE_FORCE_LOCKOUT", userId: user.id, details: { email, lockedUntil } });
  }
  metrics.incFailedLogins();
};

const checkLockout = (user) => {
  if (!user || !user.locked_until) return;
  const until = new Date(user.locked_until);
  if (isNaN(until.getTime()) || until <= new Date()) return; // already expired
  throw new ApiError(429, "Account locked temporarily due to too many failed attempts");
};

// ─── Login + MFA challenge (B3) ───────────────────────────────────────────

const login = async ({ email, password, ipAddress }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) throw new ApiError(400, "Email is required");
  if (!password) throw new ApiError(400, "Password is required");

  const user = await userRepository.findUserByEmail(normalizedEmail);
  checkLockout(user);

  const isPasswordValid = user && (await comparePassword(password, user.password_hash));

  if (!user || !isPasswordValid) {
    await recordFailedLogin({ user, ipAddress, email: normalizedEmail });
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.status !== "ACTIVE") {
    await recordFailedLogin({ user, ipAddress, email: normalizedEmail });
    throw new ApiError(403, "Account is not active");
  }

  await userRepository.updateLastLogin(user.id);
  const currentUser = await userRepository.findUserById(user.id);
  await auditLogin({ userId: user.id, success: true, ipAddress, email: normalizedEmail });
  await securityEvents.recordSecurityEvent({ action: "LOGIN_SUCCESS", userId: user.id, details: { email: normalizedEmail } });
  metrics.incSuccessfulLogins();

  // Admin MFA gateway (B3): issue a short-lived single-purpose challenge
  // token containing the encrypted TOTP secret. The client must present a
  // valid TOTP code (or recovery code) via /auth/mfa/verify before receiving
  // the full access token.
  if (
    currentUser.role === "ADMINISTRATOR" &&
    (env.MFA_ADMIN_REQUIRED || currentUser.mfa_enabled) &&
    currentUser.mfa_secret_enc
  ) {
    const encSecret = currentUser.mfa_secret_enc;
    const challengeToken = jwtUtil.generateAccessToken(
      { sub: currentUser.public_id, userId: currentUser.id, role: currentUser.role, purpose: "mfa_challenge", mfaSecret: encSecret },
      { expiresIn: "5m" }
    );
    return { mfaRequired: true, mfaChallengeToken: challengeToken, tokenType: "mfa_challenge", expiresIn: "5m", user: toSafeUser(currentUser) };
  }

  const accessToken = jwtUtil.generateAccessToken(
    { sub: currentUser.public_id, userId: currentUser.id, role: currentUser.role },
    { tokenVersion: currentUser.token_version || 0 }
  );
  const expiresIn = env.JWT.EXPIRES_IN || "8h";

  return { accessToken, tokenType: "Bearer", expiresIn, user: toSafeUser(currentUser) };
};

// ─── Secure demo access (SIH/exhabitions) ─────────────────────────────────
// DEMO_MODE-gated convenience login for dedicated demo accounts. Reuses the
// exact same JWT/session flow as a completed normal login (B3) so the issued
// token, token_version, audit trail and RBAC are identical to a real session.
// Demonstrations must never re-enable this in production.
const DEMO_LOGIN_ROLES = new Set(["ADMINISTRATOR", "SECURITY_OPERATOR"]);

const demoLogin = async ({ role, ipAddress }) => {
  if (!env.DEMO_MODE) {
    throw new ApiError(403, "Demo access is not enabled");
  }

  const requestedRole = typeof role === "string" ? role.trim().toUpperCase() : "";
  if (!DEMO_LOGIN_ROLES.has(requestedRole)) {
    throw new ApiError(400, "Invalid demo role requested");
  }

  // Only preconfigured is_demo=1 accounts are reachable; an attacker cannot
  // target arbitrary users. No passwords are stored or compared here.
  const user = await userRepository.findDemoUserByRole(requestedRole);
  if (!user) throw new ApiError(404, "Demo account is not configured");
  if (user.status !== "ACTIVE") throw new ApiError(403, "Demo account is unavailable");

  await userRepository.updateLastLogin(user.id);
  const currentUser = await userRepository.findUserById(user.id);
  await auditLogin({ userId: user.id, success: true, ipAddress, email: user.email, details: { method: "demo" } });
  await securityEvents.recordSecurityEvent({ action: "LOGIN_SUCCESS", userId: user.id, details: { email: user.email, method: "demo" } });
  metrics.incSuccessfulLogins();

  const accessToken = jwtUtil.generateAccessToken(
    { sub: currentUser.public_id, userId: currentUser.id, role: currentUser.role },
    { tokenVersion: currentUser.token_version || 0 }
  );
  const expiresIn = env.JWT.EXPIRES_IN || "8h";

  return { accessToken, tokenType: "Bearer", expiresIn, user: toSafeUser(currentUser) };
};

// ─── MFA verification (B3) ─────────────────────────────────────────────────

const mfaVerify = async ({ mfaChallengeToken, code, ipAddress }) => {
  if (!mfaChallengeToken || !code) throw new ApiError(400, "mfaChallengeToken and code are required");

  let payload;
  try { payload = jwtUtil.verifyAccessToken(mfaChallengeToken); } catch {
    throw new ApiError(401, "MFA challenge token invalid or expired");
  }
  if (payload.purpose !== "mfa_challenge") throw new ApiError(401, "Not an MFA challenge token");

  // Attempt TOTP verification first, then recovery code fallback.
  const user = await userRepository.findUserById(payload.userId);
  if (!user || user.status !== "ACTIVE") throw new ApiError(401, "Account unavailable");

  let valid = false;
  let usedRecovery = false;

  // 1) TOTP
  if (user.mfa_secret_enc) {
    const secret = user.mfa_secret_enc; // already encrypted with EVIDENCE_MASTER_KEY; decrypt if key is configured
    const rawSecret = env.EVIDENCE_MASTER_KEY
      ? (require("../security/crypto.service").decryptAESGCM(secret, env.EVIDENCE_MASTER_KEY, { aad: `mfa:${user.id}` }) || "").toString("utf8")
      : secret;
    valid = mfa.verifyCode(rawSecret, code, env.MFA_WINDOW);
  }

  // 2) Recovery code fallback
  if (!valid) {
    const codeHash = mfa.hashRecoveryCode(code);
    const recCode = await mfaRepository.findRecoveryCode(codeHash, user.id);
    if (recCode) {
      await mfaRepository.consumeRecoveryCode(recCode.id);
      valid = true;
      usedRecovery = true;
      await securityEvents.recordSecurityEvent({ action: "MFA_SUCCESS", userId: user.id, details: { method: "recovery_code" } });
    }
  }

  if (!valid) {
    await securityEvents.recordSecurityEvent({ action: "MFA_FAILED", userId: user.id, details: { email: user.email } });
    metrics.incMfaFailures();
    await auditLogin({ userId: user.id, success: false, ipAddress, email: user.email });
    throw new ApiError(401, "Invalid MFA code");
  }

  await securityEvents.recordSecurityEvent({ action: "MFA_SUCCESS", userId: user.id, details: { method: "totp", usedRecoveryCode: usedRecovery } });
  await userRepository.clearFailedAttempts(user.id);
  const freshUser = await userRepository.findUserById(user.id);

  const accessToken = jwtUtil.generateAccessToken(
    { sub: freshUser.public_id, userId: freshUser.id, role: freshUser.role },
    { tokenVersion: freshUser.token_version || 0 }
  );
  return { accessToken, tokenType: "Bearer", expiresIn: env.JWT.EXPIRES_IN || "8h", user: toSafeUser(freshUser) };
};

// ─── MFA enrolment (B3) — generates secret + recovery codes ────────────────

const mfaEnroll = async ({ userId }, actor) => {
  if (!env.EVIDENCE_MASTER_KEY) throw new ApiError(400, "EVIDENCE_MASTER_KEY must be configured to store MFA secrets");
  const user = await userRepository.findUserById(userId);
  if (!user) throw new ApiError(404, "User not found");
  if (user.role !== "ADMINISTRATOR") throw new ApiError(403, "Only administrator accounts may enroll MFA");

  const secret = mfa.generateSecret();
  const encryptedSecret = require("../security/crypto.service").encryptAESGCM(secret, env.EVIDENCE_MASTER_KEY, { aad: `mfa:${user.id}` });
  if (!encryptedSecret) throw new ApiError(400, "Failed to encrypt MFA secret (configure EVIDENCE_MASTER_KEY)");
  await userRepository.saveMfa({ userId: user.id, secretEnc: encryptedSecret, keyId: env.EVIDENCE_ACTIVE_KEY_ID || "ev-enc-v1", enabled: true });

  const codes = mfa.generateRecoveryCodes(8);
  const hashes = codes.map((c) => mfa.hashRecoveryCode(c));
  await mfaRepository.insertRecoveryCodes({ userId: user.id, codeHashes: hashes });

  await securityEvents.recordSecurityEvent({ action: "MFA_ENABLED", userId: user.id, details: { adminAction: !!(actor && actor.userId !== userId) } });

  // Return unhashed codes only once.
  return { secret, recoveryCodes: codes, qrIssuer: env.MFA_ISSUER || "IBVAP", user: toSafeUser(await userRepository.findUserById(userId)) };
};

// ─── Session management (B10) ─────────────────────────────────────────────

const getCurrentUser = async (sub) => {
  const user = await userRepository.findUserByPublicId(sub);

  if (!user) throw new ApiError(401, "User no longer exists");
  if (user.status !== "ACTIVE") throw new ApiError(403, "Account is not active");

  return toSafeUser(user);
};

const updateProfile = async ({ publicId }, body, actor) => {
  const fullName = body && (body.fullName ?? body.full_name ?? null);
  if (fullName === null || fullName === undefined) {
    throw new ApiError(400, "No profile fields provided to update");
  }
  if (typeof fullName !== "string" || fullName.trim() === "") {
    throw new ApiError(400, "fullName is required");
  }
  const trimmed = fullName.trim();
  if (trimmed.length > 120) {
    throw new ApiError(400, "fullName must be 120 characters or fewer");
  }

  const user = await userRepository.findUserByPublicId(publicId);
  if (!user) throw new ApiError(401, "User no longer exists");
  if (user.status !== "ACTIVE") throw new ApiError(403, "Account is not active");

  const conn = await userRepository.beginTransaction();
  let updated;
  try {
    updated = await userRepository.updateFullName({ userId: user.id, conn }, trimmed);
    await auditService.recordAudit({
      userId: user.id,
      action: "PROFILE_UPDATED",
      entityType: "user",
      entityId: user.public_id,
      details: { field: "fullName" },
      ipAddress: actor && actor.ipAddress,
    }, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  realtimeService.emitProfileUpdated(updated);
  return toSafeUser(updated);
};

// Logout now revokes the current token (jti) and bumps token_version so any
// cached tokens immediately become invalid (B10). Password/security changes
// can reuse bumpTokenVersion for broad invalidation.
const logout = async (actor, tokenPayload = null) => {
  if (tokenPayload && tokenPayload.jti) {
    await integrityRepository.insertRevocation({ jti: tokenPayload.jti, userId: actor.userId, reason: "logout" });
    sessionStore.revokeJti(tokenPayload.jti, { userId: actor.userId, reason: "logout" });
  }
  const newVersion = await userRepository.bumpTokenVersion(actor.userId);
  await securityEvents.recordSecurityEvent({ action: "SESSION_REVOKED", userId: actor.userId, details: { newVersion, method: "logout" } });
  await userRepository.auditInsert({
    userId: actor.userId,
    action: "LOGOUT",
    entityType: "user",
    entityId: actor.publicId,
    details: null,
    ipAddress: actor.ipAddress,
  });
  return { tokenVersion: newVersion };
};

// Admin: revoke all sessions for a target user by bumping their token_version.
const adminRevokeSessions = async ({ targetUserId }, actor) => {
  const target = await userRepository.findUserById(targetUserId);
  if (!target) throw new ApiError(404, "User not found");
  const newVersion = await userRepository.bumpTokenVersion(targetUserId);
  await securityEvents.recordSecurityEvent({ action: "ADMIN_ACTION", userId: actor.userId, details: { targetUserId, action: "revoke_sessions", newVersion } });
  return { tokenVersion: newVersion, user: toSafeUser(await userRepository.findUserById(targetUserId)) };
};

module.exports = { login, demoLogin, mfaVerify, mfaEnroll, getCurrentUser, updateProfile, logout, adminRevokeSessions };