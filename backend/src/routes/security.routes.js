const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const securityController = require("../controllers/security.controller");

const router = Router();

router.use(authenticate);

router.get("/overview", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(securityController.overview));
router.get("/metrics", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR"), asyncHandler(securityController.metricsText));
router.post("/retry-anchors", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR"), asyncHandler(securityController.retryAnchors));

module.exports = router;