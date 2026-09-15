const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const authController = require("../controllers/auth.controller");
const metrics = require("../security/metrics");

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.isProduction() ? 15 * 60 * 1000 : 5 * 60 * 1000,
  max: env.isProduction() ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.incRateLimitBlocks();
    res.status(429).json({ success: false, message: "Too many login attempts, please try again later", data: null, errors: [] });
  },
});

const mfaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.incRateLimitBlocks();
    res.status(429).json({ success: false, message: "Too many MFA attempts", data: null, errors: [] });
  },
});

router.post("/login", loginLimiter, asyncHandler(authController.login));
router.post("/mfa/verify", mfaLimiter, asyncHandler(authController.mfaVerify));
router.post("/mfa/enroll", authenticate, authorizeRoles("ADMINISTRATOR"), asyncHandler(authController.mfaEnroll));
router.post("/users/:userId/revoke-sessions", authenticate, authorizeRoles("ADMINISTRATOR"), asyncHandler(authController.revokeSessions));
router.get("/me", authenticate, asyncHandler(authController.me));
router.patch("/profile", authenticate, asyncHandler(authController.updateProfile));
router.post("/logout", authenticate, asyncHandler(authController.logout));

module.exports = router;