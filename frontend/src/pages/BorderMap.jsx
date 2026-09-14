import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import { AlertTriangleIcon, MapPinIcon, RefreshIcon } from "../components/common/Icons";
import MapFilters from "../components/map/MapFilters";
import MapControls from "../components/map/MapControls";
import MapLegend from "../components/map/MapLegend";
import MapLayers from "../components/map/MapLayers";
import SelectedMapItem from "../components/map/SelectedMapItem";
import CameraPopup from "../components/map/CameraPopup";
import AlertPopup from "../components/map/AlertPopup";
import ZonePopup from "../components/map/ZonePopup";
import FencePopup from "../components/map/FencePopup";

import {
  hasGeographicMapData,
  useMapInstance,
  useBorderMapLayers,
  useMapResize,
} from "../components/map/useBorderMap";

import { getBorderMapData } from "../services/mapApi";
import useCurrentLocation from "../hooks/useCurrentLocation";
import useMapRealtime from "../components/map/useMapRealtime";

import "../components/map/map.css";

const DEFAULT_FILTERS = {
  search: "",
  sector: "all",
  status: "all",
  severity: "all",
};

const DEFAULT_LAYERS = {
  cameras: true,
  alerts: true,
  zones: true,
  fences: true,
  info: false,
};

function SummaryCard({
  label,
  value,
  helper,
  dotClass = "bg-slate-400",
  valueClass = "text-slate-900",
}) {
  return (
    <div className="card px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>

        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p
          className={`text-2xl font-semibold tracking-tight sm:text-[28px] ${valueClass}`}
        >
          {value}
        </p>

        <p className="pb-1 text-right text-[11px] leading-4 text-slate-400">
          {helper}
        </p>
      </div>
    </div>
  );
}

function BorderMap() {
  const navigate = useNavigate();

  const containerRef = useRef(null);
  const mapRef = useMapInstance(containerRef);

  const [data, setData] = useState({
    cameras: [],
    alerts: [],
    zones: [],
    fences: [],
    sectors: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);

  const [selected, setSelected] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const {
    location,
    status: locationStatus,
    message: locationMessage,
    requestLocation,
  } = useCurrentLocation();

  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);

    getBorderMapData()
      .then((d) => {
        setData(d);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useMapRealtime(setData, loadData);

  useEffect(() => {
    setSelected((current) => {
      if (!current) return current;

      const collection =
        data[
          {
            camera: "cameras",
            alert: "alerts",
            zone: "zones",
            fence: "fences",
          }[current.kind]
        ];

      const updated = collection?.find((item) => item.id === current.id);

      return updated
        ? {
            ...updated,
            kind: current.kind,
          }
        : null;
    });
  }, [data]);

  const handleSelect = useCallback((item) => {
    setSelected(item);
  }, []);

  const renderPopup = useCallback(
    (item) => {
      if (!item) return null;

      if (item.kind === "camera") {
        return (
          <CameraPopup
            camera={item}
            onViewCamera={() => navigate(`/surveillance/${item.id}`)}
            onViewEvents={() => navigate("/events")}
          />
        );
      }

      if (item.kind === "alert") {
        return (
          <AlertPopup
            alert={item}
            onViewAlert={() => navigate(`/alerts/${item.id}`)}
          />
        );
      }

      if (item.kind === "zone") {
        return <ZonePopup zone={item} />;
      }

      if (item.kind === "fence") {
        return <FencePopup fence={item} />;
      }

      return null;
    },
    [navigate]
  );

  const apiRef = useBorderMapLayers({
    mapRef,
    data,
    layers,
    filters,
    selected,
    selectedRef,
    onSelect: handleSelect,
    renderPopup,
    location,
  });

  useMapResize(containerRef, apiRef, `${fullscreen}:${loading}`);

  useEffect(() => {
    if (locationStatus !== "granted" || !location) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      apiRef.current?.centerOnLocation?.();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [apiRef, location, locationStatus]);

  const sectors = useMemo(() => {
    const sectorSet = new Set();

    data.cameras.forEach((camera) => {
      sectorSet.add(camera.sector);
    });

    data.alerts.forEach((alert) => {
      sectorSet.add(alert.sector);
    });

    data.zones.forEach((zone) => {
      sectorSet.add(zone.sector);
    });

    data.fences.forEach((fence) => {
      sectorSet.add(fence.sector);
    });

    return Array.from(sectorSet).filter(Boolean);
  }, [data]);

  const summary = useMemo(() => {
    const online = data.cameras.filter(
      (camera) => String(camera.status).toLowerCase() === "online"
    ).length;

    const alerts = data.alerts.length;

    const zones = data.zones.length;

    const highRisk = data.zones.filter(
      (zone) => String(zone.riskLevel).toLowerCase() === "high"
    ).length;

    return {
      online,
      total: data.cameras.length,
      alerts,
      zones,
      highRisk,
    };
  }, [data]);

  const handleSearch = (term) => {
    const value = term.trim();

    if (!value) {
      return;
    }

    apiRef.current.search?.(value);
  };

  const toggleFullscreen = useCallback(() => {
    setFullscreen((value) => !value);
  }, []);

  const hasMappedData = useMemo(() => {
    return hasGeographicMapData(data);
  }, [data]);

  /*
   * RIGHT ALERT SIDEBAR
   *
   * Increased width:
   * lg  -> 400px
   * xl  -> 430px
   * 2xl -> 460px
   *
   * This makes the card expand toward the LEFT.
   */
  const sidebar = (
    <aside
      className={`flex min-w-0 flex-col gap-2 ${
        fullscreen
          ? "min-h-0"
          : "w-full shrink-0 lg:w-auto"
      }`}
    >
      <div className={fullscreen ? "shrink-0" : ""}>
        <SelectedMapItem
          item={selected}
          onClose={() => setSelected(null)}
          actions={{
            onViewCamera: (id) => {
              navigate(`/surveillance/${id}`);
            },

            onViewEvents: () => {
              navigate("/events");
            },

            onViewAlert: (id) => {
              navigate(`/alerts/${id}`);
            },
          }}
        />
      </div>
    </aside>
  );

  const mapArea = (
    <section
      className={`min-w-0 ${
        fullscreen
          ? "flex min-h-0 flex-1 flex-col"
          : "flex-1"
      }`}
    >
      <div className="card overflow-hidden rounded-xl">
        {/* Filters */}
        <div className="border-b border-white/20 px-3 py-3 sm:px-4">
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
                onShowLocation={requestLocation}
                locationLoading={locationStatus === "loading"}
              />
            }
          />
        </div>

        {/* Location Message */}
        {locationMessage && (
          <div className="border-b border-slate-200 px-3 py-2 sm:px-4">
            <p
              className={`text-xs font-medium ${
                locationStatus === "loading"
                  ? "text-blue-600"
                  : "text-amber-700"
              }`}
              role="status"
            >
              {locationMessage}
            </p>
          </div>
        )}

        {/* Map */}
        <div
          className={`relative isolate ${
            fullscreen ? "min-h-0 flex-1" : ""
          }`}
        >
          <div
            ref={containerRef}
            className={`ibvap-map-container relative isolate z-0 w-full ${
              fullscreen
                ? "h-[calc(100vh-120px)] min-h-[520px]"
                : "h-[560px] xl:h-[620px]"
            }`}
            role="application"
            aria-label="Surveillance border map"
          />

          {/* Loading / Error */}
          {(loading || error) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 px-6 text-center backdrop-blur-[2px]">
              {loading ? (
                <>
                  <Loader />

                  <p className="text-sm text-slate-500">
                    Loading surveillance map...
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangleIcon
                    size={28}
                    className="text-red-500"
                  />

                  <p className="text-sm font-medium text-slate-700">
                    Unable to load map data.
                  </p>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadData}
                  >
                    <RefreshIcon size={15} />

                    Retry
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Empty Map */}
          {!loading &&
            !error &&
            !hasMappedData &&
            !location && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/95 px-6 text-center backdrop-blur-[2px]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                  <MapPinIcon
                    size={20}
                    className="text-slate-300"
                  />
                </div>

                <p className="mt-3 text-sm font-semibold text-white">
                  No mapped data available
                </p>

                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-300">
                  Cameras, zones and virtual fences with geographic
                  coordinates will appear here.
                </p>

                <Button
                  variant="secondary"
                  size="sm"
                  className="map-location-button mt-3"
                  onClick={requestLocation}
                  loading={locationStatus === "loading"}
                >
                  {locationStatus === "loading"
                    ? "Getting location..."
                    : "Show My Location"}
                </Button>
              </div>
            )}

          {/* Map Legend + Layers */}
          {!loading && !error && (
            <>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[400]">
                <MapLegend />
              </div>

              <div className="pointer-events-none absolute bottom-12 right-3 z-[400]">
                <MapLayers
                  layers={layers}
                  onChange={setLayers}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );

  /*
   * FULLSCREEN
   *
   * Alert panel = 440px
   * Smaller gap = 8px
   * Smaller outer padding = 8px
   */
  if (fullscreen) {
    return (
      <div className="ibvap-map-expanded flex min-h-0 flex-col bg-slate-50">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_auto]">
          {mapArea}

          {sidebar}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Border Map"
        subtitle="Live view of cameras, active alerts, monitored zones and virtual fences"
      >
        <Button
          variant="ghost"
          size="sm"
          className="border border-white/20 text-white transition-colors hover:bg-white/10 hover:text-white"
          onClick={loadData}
          aria-label="Refresh map data"
        >
          <RefreshIcon size={15} />

          Refresh
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="border border-white/20 text-white transition-colors hover:bg-white/10 hover:text-white"
          onClick={toggleFullscreen}
          aria-label="Toggle full screen map"
        >
          Full Screen
        </Button>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Cameras Online"
          value={`${summary.online} / ${summary.total}`}
          helper="Operational"
          dotClass={
            summary.online
              ? "bg-emerald-500"
              : "bg-red-500"
          }
        />

        <SummaryCard
          label="Active Alerts"
          value={summary.alerts}
          helper="Open incidents"
          dotClass={
            summary.alerts
              ? "bg-red-500"
              : "bg-slate-300"
          }
          valueClass={
            summary.alerts
              ? "text-red-600"
              : "text-slate-900"
          }
        />

        <SummaryCard
          label="Monitored Zones"
          value={summary.zones}
          helper="Configured areas"
          dotClass="bg-blue-500"
        />

        <SummaryCard
          label="High-Risk Sectors"
          value={summary.highRisk}
          helper="Need attention"
          dotClass={
            summary.highRisk
              ? "bg-amber-500"
              : "bg-slate-300"
          }
          valueClass={
            summary.highRisk
              ? "text-amber-600"
              : "text-slate-900"
          }
        />
      </div>

      {/* Map + Alerts */}
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row">
        {mapArea}

        {sidebar}
      </div>
    </div>
  );
}

export default BorderMap;
