import { useEffect } from "react";
import { useRealtime } from "../../context/RealtimeContext";
import { SOCKET_EVENTS } from "../../services/websocket";
import { applyMapAlert, applyMapCamera } from "../../utils/mapData.mjs";

// Full map and dashboard preview share the same socket reconciliation.
export default function useMapRealtime(setData, reload) {
  const { subscribe, operationalDataEpoch } = useRealtime();
  useEffect(() => {
    const alert = (payload) => setData((data) => applyMapAlert(data, payload?.data));
    const camera = (payload) => setData((data) => applyMapCamera(data, payload?.data));
    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_NEW, alert),
      subscribe(SOCKET_EVENTS.ALERT_UPDATED, alert),
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, alert),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, alert),
      subscribe(SOCKET_EVENTS.CAMERA_STATUS, camera),
      subscribe(SOCKET_EVENTS.CAMERA_UPDATED, camera),
    ];
    return () => offs.forEach((off) => off());
  }, [subscribe, setData]);
  useEffect(() => {
    if (operationalDataEpoch) reload();
  }, [operationalDataEpoch, reload]);
}
