const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const integrityController = require("../controllers/integrity.controller");

const router = Router();

router.use(authenticate);

// Verify is a deliberate cryptographic check; bound it lightly.
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get("/:evidenceId/integrity", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(integrityController.detail));
router.post("/:evidenceId/verify", verifyLimiter, authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(integrityController.verify));
router.get("/:evidenceId/custody", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(integrityController.custody));
router.get("/:evidenceId/ledger", authorizeRoles("ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"), asyncHandler(integrityController.ledger));

module.exports = router;