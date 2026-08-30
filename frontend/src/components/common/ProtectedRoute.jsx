import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/**
 * Guards routes behind authentication. If the user is not logged in they
 * are redirected to /login (their intended destination is remembered so
 * they can be returned there after signing in).
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const to = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${to}`} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
