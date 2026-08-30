import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectSocket,
  disconnectSocket,
  on,
} from "../services/websocket";

/**
 * Hook to consume WebSocket/Socket.IO events.
 * Usage:
 *   const { connected, liveAlert, cameraStatus } = useWebSocket();
 * When connected=false is passed (default until a backend exists), the hook
 * stays idle so no network connection is attempted — the UI falls back to
 * polling via the services layer.
 */
export function useWebSocket({ connected = false } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [liveAlert, setLiveAlert] = useState(null);
  const [cameraStatus, setCameraStatus] = useState(null);
  const [newEvent, setNewEvent] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!connected) return;
    const socket = connectSocket({ connected: true });
    socketRef.current = socket;
    if (!socket) return;

    setIsConnected(socket.connected);

    const offs = [
      on("connect", () => setIsConnected(true)),
      on("disconnect", () => setIsConnected(false)),
      on("live-alert", (payload) => setLiveAlert(payload)),
      on("camera-status", (payload) => setCameraStatus(payload)),
      on("new-event", (payload) => setNewEvent(payload)),
      on("system-health", (payload) => setSystemHealth(payload)),
    ];

    return () => {
      offs.forEach((off) => off?.());
      disconnectSocket();
      socketRef.current = null;
    };
  }, [connected]);

  const resetLive = useCallback(() => setLiveAlert(null), []);

  return {
    connected: isConnected,
    liveAlert,
    cameraStatus,
    newEvent,
    systemHealth,
    resetLive,
  };
}
