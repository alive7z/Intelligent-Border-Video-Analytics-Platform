import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../common/Badge";
import DashboardCameraCard from "./DashboardCameraCard";
import { CameraIcon, ArrowRightIcon } from "../common/Icons";
import {
  getAllCameras,
  fromSocketCamera,
  fetchRuntimeMap,
  mergeRuntimeCamera,
} from "../../services/cameraApi";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";
import { upsertByKey } from "../../utils/realtime";
import useMediaQuery from "../../hooks/useMediaQuery";
import {
  getSingleCameraMaxWidth,
  getLiveGridTemplate,
  shouldCenterSingleCamera,
} from "../../utils/overviewGrid";

// One page-level runtime sync cadence (not per card/render). Live truth comes
// from the backend runtime-status endpoint; the static DB row is the fallback.
const RUNTIME_SYNC_MS = 5000;

function LiveSurveillanceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="h-44 animate-shimmer rounded-2xl" />
      <div className="h-44 animate-shimmer rounded-2xl" />
    </div>
  );
}

function LiveSurveillanceEmpty() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-muted dark:bg-slate-100">
        <CameraIcon size={22} />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">
          No cameras online
        </p>
        <p className="mt-1 text-sm text-muted">
          Live camera feeds will appear here when a camera comes online.
        </p>
      </div>
      <Link
        to="/surveillance"
        className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-slate-50 dark:bg-slate-100"
      >
        Open Surveillance
        <ArrowRightIcon size={14} />
      </Link>
    </div>
  );
}

/**
 * Overview "Live Surveillance" section. Shows ONLY cameras that are currently
 * ONLINE (realtime runtime status) inside a FIXED section size. The camera grid
 * is CSS auto-fit: landscape cards (min ~280-340px wide) are laid out by the
 * browser from the online count + container width, so any N cameras fit without
 * hardcoded counts; overflow scrolls internally. Offline cameras never appear
 * here. Other pages (Surveillance, Camera Management, Admin, Details) still
 * list offline cameras.
 */
function LiveSurveillance() {
  const [cameras, setCameras] = useState([]);
  const [runtimeById, setRuntimeById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { subscribe } = useRealtime();

  const isDesktopUp = useMediaQuery("(min-width: 1024px)");

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getAllCameras()
      .then((res) => setCameras(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Realtime: apply camera status/update events by camera_code so ONLINE/OFFLINE
  // changes reflect immediately (metadata only; preview tokens are separate).
  useEffect(() => {
    const applyCamera = (payload) => {
      const item = fromSocketCamera(payload?.data);
      if (!item?.id) return;
      setCameras((prev) => upsertByKey(prev, item, "id"));
    };
    const offs = [
      subscribe(SOCKET_EVENTS.CAMERA_STATUS, applyCamera),
      subscribe(SOCKET_EVENTS.CAMERA_UPDATED, applyCamera),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe]);

  // Live runtime sync: one interval for the whole section.
  const camerasRef = useRef(cameras);
  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  const syncingRef = useRef(false);
  const syncRuntime = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const map = await fetchRuntimeMap(camerasRef.current);
      setRuntimeById((prev) => ({ ...prev, ...map }));
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    syncRuntime();
    const timer = setInterval(syncRuntime, RUNTIME_SYNC_MS);
    return () => clearInterval(timer);
  }, [syncRuntime, cameras.length]);

  // Merge runtime truth onto the base rows; then keep ONLY online cameras.
  // Runtime NEVER fabricates an ONLINE state when absent.
  const onlineCameras = useMemo(
    () =>
      cameras
        .filter((c) => c.enabled)
        .map((c) => mergeRuntimeCamera(c, runtimeById[c.id] || null))
        .filter((c) => c.status === "online")
        .sort((a, b) => String(a.id || "").localeCompare(String(b.id || ""))),
    [cameras, runtimeById]
  );

  const onlineCount = onlineCameras.length;
  const gridTemplate = getLiveGridTemplate(isDesktopUp);
  const singleCamera = shouldCenterSingleCamera(onlineCount);

  return (
    <div className="card flex h-auto min-w-0 flex-col overflow-hidden sm:h-[600px] lg:h-[640px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-100/10">
        <div className="flex items-center gap-2">
          <CameraIcon size={18} className="text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-primary">
            Live Surveillance
          </h3>
          {!loading && !error && onlineCount > 0 && (
            <Badge tone="success" dot>
              {onlineCount} Online
            </Badge>
          )}
        </div>
        <Link
          to="/surveillance"
          className="btn-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-slate-50 dark:bg-slate-100"
        >
          Open Surveillance
          <ArrowRightIcon size={14} />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        {loading ? (
          <LiveSurveillanceSkeleton />
        ) : error ? (
          <LiveSurveillanceEmpty />
        ) : onlineCount === 0 ? (
          <LiveSurveillanceEmpty />
        ) : (
          <div
            className="grid min-h-0 flex-1 w-full gap-4 overflow-y-auto"
            style={{
              gridTemplateColumns: gridTemplate,
              gridAutoRows: "auto",
              placeContent: singleCamera ? "center" : "start",
              ...(singleCamera
                ? { maxWidth: getSingleCameraMaxWidth(), marginInline: "auto" }
                : {}),
            }}
          >
            {onlineCameras.map((camera) => (
              <DashboardCameraCard key={camera.id} camera={camera} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveSurveillance;