import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from api import camera_registry

from config import AI_CAMERA_CODE, AI_SERVICE_NAME, ANPR_ENABLED, CONTEXT_ENABLED, FACE_DETECTION_ENABLED, PREVIEW_ENABLED, RISK_ENABLED, TRACKER, VIDEO_SOURCE, YOLO_DEVICE, YOLO_MODEL
from schemas.health import AnprHealth, FaceDetectionHealth, HealthResponse, VideoSourceHealth
from streaming.preview import iter_mjpeg
from streaming.stream_health import StreamHealth, StreamStatus
from utils.logger import get_logger

logger = get_logger("api.routes")

router = APIRouter()

_global_health: StreamHealth | None = None
_global_model_info: dict = {"loaded": False, "name": YOLO_MODEL, "device": YOLO_DEVICE, "loadErrors": 0}
_global_tracking_info: dict = {"enabled": False, "tracker": TRACKER}
_global_context_info: dict = {"enabled": CONTEXT_ENABLED, "status": "NOT_CONFIGURED", "zonesLoaded": 0, "fencesLoaded": 0}
_global_risk_info: dict = {"enabled": RISK_ENABLED, "status": "NOT_CONFIGURED", "rulesLoaded": 0, "rulesEnabled": 0}
_global_anpr_info: dict = {
    "enabled": ANPR_ENABLED, "detectorLoaded": False, "detectorMode": "UNKNOWN",
    "ocrLoaded": False, "ocrEngine": "easyocr", "ocrStatus": "NOT_LOADED", "status": "UNAVAILABLE",
}
_global_face_info: dict = {
    "enabled": FACE_DETECTION_ENABLED, "modelLoaded": False, "status": "UNAVAILABLE", "recognition": False,
}
_global_preview_store = None
_global_source_info: dict = {}


def set_stream_health(health: StreamHealth) -> None:
    if camera_registry.publish("health", health):
        return
    global _global_health
    _global_health = health


def set_preview_store(store) -> None:
    """Register the active camera's latest-frame store for /internal/preview."""
    if camera_registry.publish("preview", store):
        return
    global _global_preview_store
    _global_preview_store = store


def set_live_source_info(info: dict) -> None:
    """Publish live source info (cameraCode/sourceType/protocol/status/session)."""
    if camera_registry.publish("source", info or {}):
        return
    global _global_source_info
    _global_source_info = info or {}

def set_model_info(info: dict) -> None:
    if camera_registry.publish("model", info):
        return
    global _global_model_info
    _global_model_info = info


def set_tracking_info(info: dict) -> None:
    if camera_registry.publish("tracking", info):
        return
    global _global_tracking_info
    _global_tracking_info = info


def set_context_info(info: dict) -> None:
    if camera_registry.publish("context", info):
        return
    global _global_context_info
    _global_context_info = info


def set_risk_info(info: dict) -> None:
    if camera_registry.publish("risk", info):
        return
    global _global_risk_info
    _global_risk_info = info


_global_anpr_stats: dict = {}

def set_anpr_info(info: dict) -> None:
    if camera_registry.publish("anpr", info):
        return
    global _global_anpr_info
    _global_anpr_info = info

def set_anpr_stats(stats: dict) -> None:
    if camera_registry.publish("anprStats", stats):
        return
    global _global_anpr_stats
    _global_anpr_stats = stats


def set_face_info(info: dict) -> None:
    if camera_registry.publish("face", info):
        return
    global _global_face_info
    _global_face_info = info


_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health():
    cameras = {
        code: _camera_health(runtime, code).model_dump(exclude={"cameras"})
        for code, runtime in camera_registry.snapshot().items()
    }
    if cameras:
        primary = cameras.get(AI_CAMERA_CODE) or cameras[sorted(cameras)[0]]
        return HealthResponse(**primary, cameras=cameras)
    return _camera_health()


def _camera_health(runtime=None, camera_code=None):
    runtime = runtime or {}
    scoped = camera_code is not None
    source_info = runtime.get("source", {}) if scoped else _global_source_info
    stream_health = runtime.get("health") if scoped else _global_health
    video_configured = bool(VIDEO_SOURCE)
    status = "ONLINE" if video_configured else "NOT_CONFIGURED"

    if stream_health:
        preview = runtime.get("preview") if scoped else _global_preview_store
        if preview is not None:
            stream_health.update_preview_metrics(preview.get_stats())
        report = stream_health.get_report()
        if report.get("status"):
            status = report["status"]
    else:
        report = {}

    # Keep stream synchronized with the same live StreamHealth report used by
    # videoSource. Transport metadata may refresh less often, but status and
    # frame counters must not contradict the current reader state.
    stream = dict(source_info)
    stream["cameraCode"] = camera_code or stream.get("cameraCode") or AI_CAMERA_CODE
    stream["status"] = status
    stream["sourceType"] = stream.get("sourceType") or report.get("sourceType")
    stream["streamSessionId"] = stream.get("streamSessionId") or report.get("streamSessionId")
    stream["reconnectAttempts"] = report.get(
        "reconnectAttempts", stream.get("reconnectAttempts", 0)
    )
    stream["lastFrameAt"] = report.get("lastFrameTimestamp") or stream.get("lastFrameAt")
    stream["framesRead"] = report.get("framesReceived", 0)
    stream["framesProcessed"] = report.get("framesProcessed", 0)
    for key in (
        "lastFrameAgeMs", "decodedFps", "processingFps", "previewFps",
        "averageInferenceMs", "averageFrameAgeBeforeAiMs",
        "averageFrameAgeAfterAiMs", "averageJpegEncodeMs",
        "averageJpegReadyAgeMs", "averagePreviewSendAgeMs",
        "previewFrameAgeMs", "droppedStaleFrames",
        "consecutiveReadFailures", "reconnectCount", "previewClients",
        "framesPreviewSent", "framesJpegEncoded", "connectionStartedAt",
    ):
        stream[key] = report.get(key)

    return HealthResponse(
        success=True,
        service=AI_SERVICE_NAME,
        status="healthy",
        uptime=round(time.time() - _start_time, 1),
        model=runtime.get("model", {}) if scoped else dict(_global_model_info),
        tracking=runtime.get("tracking", {}) if scoped else dict(_global_tracking_info),
        context=runtime.get("context", {}) if scoped else dict(_global_context_info),
        risk=runtime.get("risk", {}) if scoped else dict(_global_risk_info),
        anpr=AnprHealth(**(runtime.get("anpr", {}) if scoped else dict(_global_anpr_info))),
        faceDetection=FaceDetectionHealth(**(runtime.get("face", {}) if scoped else dict(_global_face_info))),
        cameraCode=stream["cameraCode"],
        videoSource=VideoSourceHealth(
            configured=bool(VIDEO_SOURCE) or bool(report.get("configured")),
            status=status,
            sourceType=report.get("sourceType"),
            fps=report.get("fps"),
            framesRead=report.get("framesReceived", 0),
            framesSampled=report.get("framesSampled", 0),
            framesProcessed=report.get("framesProcessed", 0),
            framesDropped=report.get("framesDropped", 0),
            readErrors=report.get("readErrors", 0),
            lastFrameTimestamp=report.get("lastFrameTimestamp"),
            processingFps=report.get("processingFps"),
            averageLatencyMs=report.get("averageLatencyMs"),
            decodedFps=report.get("decodedFps"),
            previewFps=report.get("previewFps"),
            averageInferenceMs=report.get("averageInferenceMs"),
            averageFrameAgeBeforeAiMs=report.get("averageFrameAgeBeforeAiMs"),
            averageFrameAgeAfterAiMs=report.get("averageFrameAgeAfterAiMs"),
            averageJpegEncodeMs=report.get("averageJpegEncodeMs"),
            averageJpegReadyAgeMs=report.get("averageJpegReadyAgeMs"),
            averagePreviewSendAgeMs=report.get("averagePreviewSendAgeMs"),
            previewFrameAgeMs=report.get("previewFrameAgeMs"),
            lastFrameAgeMs=report.get("lastFrameAgeMs"),
            droppedStaleFrames=report.get("droppedStaleFrames", 0),
            consecutiveReadFailures=report.get("consecutiveReadFailures", 0),
            reconnectCount=report.get("reconnectCount", 0),
            previewClients=report.get("previewClients", 0),
            framesPreviewSent=report.get("framesPreviewSent", 0),
            framesJpegEncoded=report.get("framesJpegEncoded", 0),
            connectionStartedAt=report.get("connectionStartedAt"),
            errorMessage=report.get("errorMessage"),
        ).model_dump(),
        stream=stream,
    )


@router.get("/internal/anpr/stats")
async def anpr_stats():
    """Internal live ANPR pipeline counters (diagnostics only)."""
    return {
        "success": True, "anpr": dict(_global_anpr_info), "stats": dict(_global_anpr_stats),
        "cameras": {code: {"anpr": runtime.get("anpr", {}), "stats": runtime.get("anprStats", {})}
                    for code, runtime in camera_registry.snapshot().items()},
    }


@router.get("/internal/preview/{camera_code}")
async def preview_mjpeg(camera_code: str):
    """Internal MJPEG preview endpoint (NOT a public frontend API).

    Serves a browser-compatible multipart/x-mixed-replace stream from the active
    camera's latest-frame store. Raw RTSP is never sent to a browser. This is
    bound to local/internal access; the Node backend gateway fronts it for
    authenticated public consumption.
    """
    if not PREVIEW_ENABLED:
        raise HTTPException(status_code=404, detail="Preview disabled")
    cameras = camera_registry.snapshot()
    runtime = cameras.get(camera_code)
    active_camera_code = _global_source_info.get("cameraCode") or AI_CAMERA_CODE
    if runtime is None and (cameras or camera_code != active_camera_code):
        raise HTTPException(status_code=404, detail="Camera preview source not active")
    store = runtime.get("preview") if runtime is not None else _global_preview_store
    if store is None:
        raise HTTPException(status_code=404, detail="No active preview source")
    # Best-effort serving: even while CONNECTING/RECONNECTING/DEGRADED the
    # latest cached annotated frame is still delivered, so the browser preview
    # never hard-disconnects during a transient RTSP frame gap. The Node gateway
    # only fails if the upstream itself is unreachable.
    stream_health = runtime.get("health") if runtime is not None else _global_health
    report = stream_health.get_report() if stream_health else {}
    if report.get("status") != StreamStatus.ONLINE:
        logger.warning(
            "Serving cached preview while stream not live (status=%s)",
            report.get("status") or "unknown",
        )
    return StreamingResponse(
        iter_mjpeg(store),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Preview-Camera": camera_code,
        },
    )
