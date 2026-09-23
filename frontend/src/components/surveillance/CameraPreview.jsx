import React from "react";
import DetectionOverlay from "./DetectionOverlay";
import { CameraIcon, VideoIcon } from "../common/Icons";
import useCameraPreviewUrl from "../../hooks/useCameraPreviewUrl";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Surveillance preview for a camera card. ONE shared fixed-landscape layout is
 * used for every camera: an aspect-video (16:9) viewport with overflow-hidden.
 * The image and its detection overlay fill it via object-cover, so rotated
 * portrait sources crop instead of letterboxing — every card keeps exactly the
 * same dimensions and framing as CAM-01 regardless of source orientation.
 *
 * Rotation is NOT applied in the browser: the AI pipeline bakes the net
 * orientation (camera rotation_degrees + display_rotation_degrees) into the
 * preview frames before drawing zones/detection text, so the MJPEG bytes are
 * already canonical. Rotating them again here would flip baked-in labels and
 * double-rotate the picture. Detection overlay stays on the same frame, so
 * boxes remain aligned. Offline/unavailable cameras render a neutral
 * placeholder and never fake imagery.
 */
function CameraPreview({ camera, showTrackId = false, showAlertBanner = false }) {
  const isOnline = camera.status === "online";
  const isTransitioning = ["connecting", "degraded", "reconnecting"].includes(
    camera.status
  );
  const canPreview = isOnline || isTransitioning;
  const cameraCode = camera.cameraCode || camera.id;
  const { previewUrl, reportImageError } = useCameraPreviewUrl(
    cameraCode,
    camera.enabled !== false && canPreview
  );

  const previewImage = previewUrl ? (
    <img
      src={previewUrl}
      alt={`Live preview for ${cameraCode}`}
      onError={reportImageError}
      className="absolute inset-0 h-full w-full object-cover"
    />
  ) : null;

  return (
    <div
      className="relative aspect-video w-full overflow-hidden bg-slate-900 dark:bg-[#09090B]"
      role="img"
      aria-label={`${cameraCode} preview`}
    >
      {canPreview ? (
        <>
          {previewImage}
          <DetectionOverlay detections={camera.detections || []} trackId={showTrackId} />

          {!previewUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white/45">
              <VideoIcon size={22} />
              <p className="text-[11px] font-medium">Loading feed…</p>
            </div>
          )}

          <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white ${isOnline ? "bg-green-500/90" : "bg-amber-600/90"}`}>
            {isOnline ? "LIVE" : formatEventLabel(camera.status)}
          </span>

          {showAlertBanner && camera.activeAlert && (
            <div className="absolute inset-x-0 bottom-2 flex justify-center">
              <div className="flex items-center gap-1.5 rounded bg-red-600/95 px-2 py-1 text-[11px] font-bold uppercase text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                High Alert · {formatEventLabel(camera.activeAlert.type)}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-800/70 dark:bg-[#131316]/80">
            <CameraIcon size={22} className="text-white/45" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Camera Offline
            </p>
            <p className="text-[10px] text-white/40">
              Last seen {camera.lastSeen || camera.lastUpdate || "—"}
            </p>
          </div>
          <span className="absolute left-2 top-2 rounded bg-slate-600/85 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            OFFLINE
          </span>
        </>
      )}
    </div>
  );
}

export default CameraPreview;
