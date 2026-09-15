const authService = require("../services/auth.service");
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

module.exports = { login, mfaVerify, mfaEnroll, me, updateProfile, logout, revokeSessions };