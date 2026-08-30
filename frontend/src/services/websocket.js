// WebSocket / Socket.IO client abstraction.
// The UI polls mock data today, but this module centralizes the connection
// logic so real-time events can be wired in later without touching pages.

import { io } from "socket.io-client";

export const SOCKET_EVENTS = {
  LIVE_ALERT: "live-alert",
  CAMERA_STATUS: "camera-status",
  NEW_EVENT: "new-event",
  SYSTEM_HEALTH: "system-health",
};

let socket = null;

/**
 * Establish (or return) the socket connection.
 * safe: when false, no network call is made and null is returned —
 * the caller can fall back to polling.
 */
export function connectSocket({ connected = false } = {}) {
  if (!connected) {
    return null;
  }
  if (socket && socket.connected) {
    return socket;
  }
  const url = import.meta.env?.VITE_WS_URL || "http://localhost:3001";
  socket = io(url, {
    transports: ["websocket"],
    auth: { token: localStorage.getItem("ibvap_token") },
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function on(event, handler) {
  if (socket) socket.on(event, handler);
  return () => socket?.off(event, handler);
}
