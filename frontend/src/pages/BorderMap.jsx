import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import Card from "../components/common/Card";
import StatusIndicator from "../components/common/StatusIndicator";
import { AlertTriangleIcon, RefreshIcon } from "../components/common/Icons";
import MapFilters from "../components/map/MapFilters";
import MapControls from "../components/map/MapControls";
import MapLegend from "../components/map/MapLegend";
import MapLayers from "../components/map/MapLayers";
import ActiveAlertsPanel from "../components/map/ActiveAlertsPanel";
import SelectedMapItem from "../components/map/SelectedMapItem";
import CameraPopup from "../components/map/CameraPopup";
import AlertPopup from "../components/map/AlertPopup";
import ZonePopup from "../components/map/ZonePopup";
import FencePopup from "../components/map/FencePopup";
import { useMapInstance, useBorderMapLayers } from "../components/map/useBorderMap";
import { getBorderMapData } from "../services/mapApi";
import "../components/map/map.css";

const DEFAULT_FILTERS = { search: "", sector: "all", status: "all", severity: "all" };
const DEFAULT_LAYERS = { cameras: true, alerts: true, zones: true, fences: true, info: false };

function SummaryCard({ label, value, tone, children }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {children}
      </div>
      <p className={`mt-1.5 text-2xl font-bold ${tone || "text-slate-900"}`}>{value}</p>
    </Card>
  );
}

function BorderMap() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useMapInstance(containerRef);

  const [data, setData] = useState({ cameras: [], alerts: [], zones: [], fences: [], sectors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [selected, setSelected] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const selectedRef = useRef(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    getBorderMapData()
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = useCallback((item) => {
    setSelected(item);
  }, []);

  const renderPopup = useCallback(
    (item) => {
      if (!item) return null;
      if (item.kind === "camera")
        return (
          <CameraPopup
            camera={item}
            onViewCamera={() => navigate(`/surveillance/${item.id}`)}
            onViewEvents={() => navigate("/events")}
          />
        );
      if (item.kind === "alert")
        return <AlertPopup alert={item} onViewAlert={() => navigate(`/alerts/${item.id}`)} />;
      if (item.kind === "zone") return <ZonePopup zone={item} />;
      if (item.kind === "fence") return <FencePopup fence={item} />;
      return null;
    },
    [navigate]
  );

  const apiRef = useBorderMapLayers({
    mapRef,
    data,
    layers,
    filters,
    selectedRef,
    onSelect: handleSelect,
    renderPopup,
  });

  const sectors = useMemo(() => {
    const s = new Set();
    data.cameras.forEach((c) => s.add(c.sector));
    data.alerts.forEach((a) => s.add(a.sector));
    return Array.from(s).filter(Boolean);
  }, [data]);

  const summary = useMemo(() => {
    const online = data.cameras.filter((c) => String(c.status).toLowerCase() === "online").length;
    const alerts = data.alerts.length;
    const zones = data.zones.length;
    const highRisk = data.zones.filter((z) => String(z.riskLevel).toLowerCase() === "high").length;
    return { online, total: data.cameras.length, alerts, zones, highRisk };
  }, [data]);

  const handleSearch = (term) => {
    const t = term.trim();
    if (!t) return;
    apiRef.current.search?.(t);
  };

  const toggleFullscreen = useCallback(() => {
    setFullscreen((f) => !f);
  }, []);

  useEffect(() => {
    if (!apiRef.current?.invalidate) return undefined;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apiRef.current?.invalidate?.());
    };
    const t1 = setTimeout(schedule, 80);
    const t2 = setTimeout(schedule, 260);
    let ro = null;
    const el = containerRef.current;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(schedule);
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [fullscreen, loading, apiRef]);

  const aside = (
    <aside className={`flex w-full min-w-0 flex-col gap-4 ${fullscreen ? "min-h-0" : "lg:w-[300px]"}`}>
      <ActiveAlertsPanel
        alerts={data.alerts}
        selectedId={selected?.kind === "alert" ? selected.id : null}
        onSelect={(a) => {
          if (apiRef.current.locateAlert) apiRef.current.locateAlert(a.id);
          else handleSelect({ kind: "alert", ...a });
        }}
        className={fullscreen ? "min-h-0 flex-1" : ""}
      />
      <div className={fullscreen ? "shrink-0" : ""}>
        <SelectedMapItem
          item={selected}
          onClose={() => setSelected(null)}
          actions={{
            onViewCamera: (id) => navigate(`/surveillance/${id}`),
            onViewEvents: () => navigate("/events"),
            onViewAlert: (id) => navigate(`/alerts/${id}`),
          }}
        />
      </div>
    </aside>
  );

  const mapArea = (
    <div className={`relative min-w-0 ${fullscreen ? "flex w-full min-h-0 flex-col" : "flex-1"}`}>
      <div className={`mb-3 ${fullscreen ? "shrink-0" : ""}`}>
        <MapFilters
          filters={filters}
          onChange={setFilters}
          sectors={sectors}
          onSearch={handleSearch}
          actions={
            <MapControls
              onRefresh={loadData}
              fullscreen={fullscreen}
              onToggleFullscreen={toggleFullscreen}
            />
          }
        />
      </div>
      <div className={`relative ${fullscreen ? "min-h-0 lg:flex-1" : ""}`}>
        <div
          ref={containerRef}
          className={`ibvap-map-container relative z-0 w-full overflow-hidden rounded-xl border border-slate-200 shadow-sm ${fullscreen ? "h-[60vh] lg:h-full" : "h-[540px]"}`}
          role="application"
          aria-label="Surveillance border map"
        />

        {(loading || error) && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-50/90 backdrop-blur-sm">
            {loading ? (
              <>
                <Loader />
                <p className="text-sm text-slate-500">Loading surveillance map...</p>
              </>
            ) : (
              <>
                <AlertTriangleIcon size={28} className="text-red-500" />
                <p className="text-sm text-slate-600">Unable to load map data.</p>
                <Button variant="secondary" size="sm" onClick={loadData}>
                  <RefreshIcon size={15} /> Retry
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {!loading && !error && (
        <>
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400]">
            <MapLegend />
          </div>
          <div className="pointer-events-none absolute bottom-14 right-3 z-[400]">
            <MapLayers layers={layers} onChange={setLayers} />
          </div>
        </>
      )}
    </div>
  );

  const body = fullscreen ? (
    <div className="flex-1 min-h-0 grid w-full min-w-0 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)] lg:p-5">
      {mapArea}
      {aside}
    </div>
  ) : (
    <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row">
      {mapArea}
      {aside}
    </div>
  );

  return (
    <div className={fullscreen ? "ibvap-map-expanded" : "space-y-5"}>
      {!fullscreen && (
        <PageHeader title="Border Map" subtitle="Operational map of cameras, active alerts, zones and virtual fences">
          <Button variant="secondary" size="sm" onClick={loadData} aria-label="Refresh map data">
            <RefreshIcon size={15} /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen} aria-label="Toggle full screen map">
            {fullscreen ? "Exit Full Screen" : "Full Screen"}
          </Button>
        </PageHeader>
      )}

      {!fullscreen && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Cameras Online" value={`${summary.online} / ${summary.total}`} tone={summary.online ? "text-green-600" : "text-red-600"}>
            <StatusIndicator status={summary.online ? "success" : "offline"} pulse={false} />
          </SummaryCard>
          <SummaryCard label="Active Alerts" value={summary.alerts} tone={summary.alerts ? "text-red-600" : "text-slate-900"} />
          <SummaryCard label="Monitored Zones" value={summary.zones} />
          <SummaryCard label="High-Risk Sectors" value={summary.highRisk} tone="text-orange-600" />
        </div>
      )}

      {body}
    </div>
  );
}

export default BorderMap;
