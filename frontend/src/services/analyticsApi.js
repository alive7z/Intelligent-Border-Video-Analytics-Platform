import request from "./api";

// GET /api/analytics/summary
export function getAnalyticsSummary() {
  return request("/api/analytics/summary");
}

// GET /api/summary  (dashboard overview KPIs)
export function getSummary() {
  return request("/api/summary");
}
