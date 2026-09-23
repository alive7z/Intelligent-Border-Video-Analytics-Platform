const ApiError = require("../utils/ApiError");
const cameraRepository = require("../repositories/camera.repository");

// Map the persisted classification (source_type) + transport (stream_protocol)
// to the transport-oriented sourceType consumed by the Python source factory.
// CLASSIFICATION       PROTOCOL   -> AI sourceType
// VIDEO_FILE           (any)      -> VIDEO_FILE        (file path)
// MOBILE               RTSP/HTTP/MJPEG -> MOBILE (cache transport via protocol)
// IP_CAMERA            RTSP       -> RTSP
// IP_CAMERA            MJPEG      -> MJPEG
// IP_CAMERA            HTTP/HLS   -> HTTP
// IP_CAMERA            WEBRTC/OTHER -> HTTP (best-effort)
// OTHER / unsupported             -> rejected (AI engine cannot ingest)
const toTransportSourceType = (sourceType, streamProtocol) => {
  const classification = (sourceType || "").toUpperCase();
  const protocol = (streamProtocol || "").toUpperCase();

  if (classification === "VIDEO_FILE") {
    return "VIDEO_FILE";
  }
  if (classification === "MOBILE") {
    return "MOBILE";
  }
  if (classification === "IP_CAMERA") {
    if (protocol === "RTSP") return "RTSP";
    if (protocol === "MJPEG") return "MJPEG";
    if (protocol === "HTTP" || protocol === "HLS" || protocol === "WEBRTC" || protocol === "OTHER") {
      return "HTTP";
    }
    return "HTTP";
  }
  return null; // OTHER / unknown classification -> unsupported
};

// GET (internal, AI service only) — camera live/video source configuration.
// Delivers the raw stream_url to the AI engine over the trusted internal route.
// This is NEVER exposed via any public/frontend API.
const getCameraSourceConfig = async (cameraCode) => {
  if (!cameraCode) {
    throw new ApiError(400, "cameraCode is required");
  }

  const camera = await cameraRepository.findByCode(cameraCode);
  if (!camera || camera.deleted_at) {
    throw new ApiError(404, "Camera not found");
  }

  const sourceType = toTransportSourceType(camera.source_type, camera.stream_protocol);
  if (!sourceType) {
    throw new ApiError(
      400,
      `Camera source type '${camera.source_type}' is not supported for AI ingestion`
    );
  }

  return toSourceConfig(camera);
};

// Effective clockwise rotation the AI pipeline must apply to the source frame
// (and matching zone/fence config) BEFORE drawing annotation text. Net =
// pipeline rotation_degrees + display_rotation_degrees, normalized to [0, 360).
// The AI therefore emits a fully canonical frame and the browser applies NO
// extra rotation on top, keeping every baked label upright regardless of the
// per-camera orientation.
const toNetRotationDegrees = (camera) => {
  const net =
    (Number(camera.rotation_degrees || 0) +
      Number(camera.display_rotation_degrees || 0)) %
    360;
  return ((net % 360) + 360) % 360;
};

const toSourceConfig = (camera) => ({
    cameraCode: camera.camera_code,
    enabled: camera.enabled,
    classification: camera.source_type,
    protocol: camera.stream_protocol || null,
    sourceType: toTransportSourceType(camera.source_type, camera.stream_protocol),
    streamUrl: camera.stream_url || null,
    targetFps: camera.target_fps === null || camera.target_fps === undefined ? null : Number(camera.target_fps),
    rotationDegrees: toNetRotationDegrees(camera),
  });

const listCameraSourceConfigs = async () => ({
  cameras: (await cameraRepository.findAllSourceConfigs())
    .filter((camera) => toTransportSourceType(camera.source_type, camera.stream_protocol))
    .map(toSourceConfig),
});

module.exports = { getCameraSourceConfig, listCameraSourceConfigs, toTransportSourceType };
