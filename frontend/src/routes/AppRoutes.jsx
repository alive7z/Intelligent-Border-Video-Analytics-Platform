import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import ProtectedRoute from "../components/common/ProtectedRoute";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import LiveSurveillance from "../pages/LiveSurveillance";
import CameraDetails from "../pages/CameraDetails";
import Alerts from "../pages/Alerts";
import AlertDetails from "../pages/AlertDetails";
import Events from "../pages/Events";
import EventDetails from "../pages/EventDetails";
import Intelligence from "../pages/Intelligence";
import BorderMap from "../pages/BorderMap";
import Analytics from "../pages/Analytics";
import Admin from "../pages/Admin";

/**
 * App route tree. Public: /login. Everything else is protected and rendered
 * inside the dashboard layout.
 */
export default function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/surveillance" element={<LiveSurveillance />} />
            <Route path="/surveillance/:cameraId" element={<CameraDetails />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/alerts/:alertId" element={<AlertDetails />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:eventId" element={<EventDetails />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/map" element={<BorderMap />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
