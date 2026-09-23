const authService = require("../services/auth.service");
const env = require("../config/env");
const { sendSuccess } = require("../utils/ApiResponse");
const { getActor } = require("../utils/actor");

const login = async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
    ipAddress: req.ip,
  });
  return sendSuccess(res, 200, "Login successful", result);
};

// Public smoke endpoint: lets the Login page decide whether to render the
// "Explore Demo" section without exposing any credentials or account info.
const demoAccess = async (req, res) => {
  return sendSuccess(res, 200, "Demo access status", { enabled: env.DEMO_MODE });
};

const demoLogin = async (req, res) => {
  const result = await authService.demoLogin({
    role: req.body.role,
    ipAddress: req.ip,
  });
  return sendSuccess(res, 200, "Demo access granted", result);
};

const mfaVerify = async (req, res) => {
  const result = await authService.mfaVerify({
    mfaChallengeToken: req.body.mfaChallengeToken,
    code: req.body.code,
    ipAddress: req.ip,
  });
  return sendSuccess(res, 200, "MFA verified", result);
};

const mfaEnroll = async (req, res) => {
  const targetId = req.body.userId || req.user.userId;
  const result = await authService.mfaEnroll({ userId: Number(targetId) }, getActor(req));
  return sendSuccess(res, 200, "MFA enrolled", result);
};

const me = async (req, res) => {
  const user = await authService.getCurrentUser(req.user.publicId);
  return sendSuccess(res, 200, "Current user retrieved", { user });
};

const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(
    { publicId: req.user.publicId, userId: req.user.userId },
    req.body || {},
    getActor(req)
  );
  return sendSuccess(res, 200, "Profile updated", { user });
};

const logout = async (req, res) => {
  await authService.logout(getActor(req), req.tokenPayload || null);
  return sendSuccess(res, 200, "Session revoked", {});
};

const revokeSessions = async (req, res) => {
  const result = await authService.adminRevokeSessions({ targetUserId: Number(req.params.userId) }, getActor(req));
  return sendSuccess(res, 200, "User sessions revoked", result);
};

module.exports = { login, demoAccess, demoLogin, mfaVerify, mfaEnroll, me, updateProfile, logout, revokeSessions };