import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import CameraFilters from "../components/surveillance/CameraFilters";
import CameraGrid from "../components/surveillance/CameraGrid";
import { getCameras } from "../services/cameraApi";

const defaultFilters = { search: "", status: "all", alert: "all", sector: "all" };

function SummaryCard({ label, value, tone }) {
  const toneCls = {
    success: "text-green-600",
    danger: "text-red-600",
    warning: "text-orange-600",
    slate: "text-slate-800",
  }[tone];
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className={`text-3xl font-bold ${toneCls}`}>{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function LiveSurveillance() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);

  const load = () => {
    setLoading(true);
    setError(false);
    getCameras()
      .then((res) => setCameras(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const sectors = useMemo(
    () => [...new Set(cameras.map((c) => c.sector).filter(Boolean))],
    [cameras]
  );

  const summary = useMemo(() => {
    const online = cameras.filter((c) => c.status === "online").length;
    const activeAlert = cameras.filter((c) => c.activeAlert).length;
    return {
      total: cameras.length,
      online,
      offline: cameras.length - online,
      activeAlert,
    };
  }, [cameras]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return cameras.filter((c) => {
      if (filters.status !== "all" && c.status !== filters.status) return false;
      if (filters.alert === "active" && !c.activeAlert) return false;
      if (filters.alert === "normal" && c.activeAlert) return false;
      if (filters.sector !== "all" && c.sector !== filters.sector) return false;
      if (
        q &&
        !`${c.id} ${c.name} ${c.location} ${c.sector}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [cameras, filters]);

  return (
    <div>
      <PageHeader
        title="Live Surveillance"
        subtitle="Monitor real-time CCTV feeds, AI detections, and active security events."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Total Cameras" value={summary.total} tone="slate" />
        <SummaryCard label="Online" value={summary.online} tone="success" />
        <SummaryCard label="Offline" value={summary.offline} tone="danger" />
        <SummaryCard label="Active Alerts" value={summary.activeAlert} tone="warning" />
      </div>

      {/* Filter bar */}
      <div className="card mt-6 p-4">
        <CameraFilters filters={filters} onChange={setFilters} sectors={sectors} />
      </div>

      {/* Grid */}
      <div className="mt-6">
        {!loading && !error && (
          <p className="mb-4 text-sm text-slate-500">
            Showing <span className="font-medium text-slate-700">{filtered.length}</span>{" "}
            of {cameras.length} cameras
          </p>
        )}
        <CameraGrid
          cameras={filtered}
          loading={loading}
          error={error}
          onRetry={load}
        />
      </div>
    </div>
  );
}

export default LiveSurveillance;
