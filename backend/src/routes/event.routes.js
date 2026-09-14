const { Router } = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const eventController = require("../controllers/event.controller");
const evidenceController = require("../controllers/evidence.controller");
const correlationService = require("../services/eventCorrelation.service");
const { getActor } = require("../utils/actor");
const { sendSuccess } = require("../utils/ApiResponse");

const router = Router();

router.use(authenticate);

const ALL = ["ADMINISTRATOR", "SECURITY_OPERATOR", "AUDITOR_ANALYST"];
const ADMIN = ["ADMINISTRATOR"];

router.get("/", authorizeRoles(...ALL), asyncHandler(eventController.list));
router.get("/summary", authorizeRoles(...ALL), asyncHandler(eventController.summary));
router.get("/:eventId/related", authorizeRoles(...ALL), asyncHandler(async (req, res) => {
  const data = await correlationService.getRelatedEvents(req.params.eventId, getActor(req));
  return sendSuccess(res, 200, "Related events retrieved", data);
}));
router.get("/:eventId/evidence", authorizeRoles(...ALL), asyncHandler(evidenceController.byEvent));
router.get("/:eventId", authorizeRoles(...ALL), asyncHandler(eventController.detail));
router.post("/:eventId/protect", authorizeRoles(...ADMIN), asyncHandler(eventController.protect));
router.post("/:eventId/unprotect", authorizeRoles(...ADMIN), asyncHandler(eventController.unprotect));
router.delete("/:eventId", authorizeRoles(...ADMIN), asyncHandler(eventController.remove));

module.exports = router;
