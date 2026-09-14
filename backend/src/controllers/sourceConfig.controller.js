const { sendSuccess } = require("../utils/ApiResponse");
const sourceConfigService = require("../services/sourceConfig.service");

// GET /api/internal/ai/cameras/:code/source-config — internal AI service only.
const getSourceConfig = async (req, res) => {
  const config = await sourceConfigService.getCameraSourceConfig(req.params.code);
  return sendSuccess(res, 200, "Source config fetched", config);
};

const listSourceConfigs = async (req, res) => {
  const config = await sourceConfigService.listCameraSourceConfigs();
  return sendSuccess(res, 200, "Source configs fetched", config);
};

module.exports = { getSourceConfig, listSourceConfigs };
