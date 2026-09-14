import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import Loader from "../common/Loader";
import { AlertTriangleIcon, MapPinIcon } from "../common/Icons";
import {
  hasGeographicMapData,
  useBorderMapLayers,
  useMapInstance,
  useMapResize,
} from "../map/useBorderMap";
import { getBorderMapData } from "../../services/mapApi";
import useCurrentLocation from "../../hooks/useCurrentLocation";
import useMapRealtime from "../map/useMapRealtime";
import "../map/map.css";

const LAYERS = {
  cameras: true,
  alerts: true,
  zones: true,
  fences: true,
  info: false,
};
const FILTERS = { search: "", sector: "all", status: "all", severity: "all" };
const EMPTY_DATA = {
  cameras: [],
  alerts: [],
  zones: [],
  fences: [],
  sectors: [],
};
const NOOP = () => {};

/** Compact dashboard surface using the same Leaflet hooks and real API bundle
 * as /map. It never requests geolocation; a session-cached location is shown
 * only after the user explicitly grants it on the full map. */
function BorderMapPreview() {
  const containerRef = useRef(null);
  const selectedRef = useRef(null);
  const mapRef = useMapInstance(containerRef, true);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { location } = useCurrentLocation();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getBorderMapData()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useMapRealtime(setData, load);

  const apiRef = useBorderMapLayers({
    mapRef,
    data,
    layers: LAYERS,
    filters: FILTERS,
    selectedRef,
    onSelect: NOOP,
    renderPopup: NOOP,
    location,
  });
  useMapResize(containerRef, apiRef, loading);

  const hasMappedData = useMemo(() => hasGeographicMapData(data), [data]);

  return (
    <Card pad={false} className="h-full min-w-0">
      <div className="flex items-center justify-between gap-3 border-b border-white/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <MapPinIcon size={18} className="text-white" />
          <h3 className="text-sm font-semibold text-slate-800">
            Border Zone Map
          </h3>
        </div>
        <Link
          to="/map"
          className="group btn-focus inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 transition-all duration-150 hover:bg-transparent hover:text-white active:scale-[0.98]"
        >
          View Full Map
        </Link>
      </div>

      <div className="p-4">
        <div className="relative isolate h-[260px] overflow-hidden rounded-lg border border-white/20">
          <div
            ref={containerRef}
            className="ibvap-map-container relative isolate z-0 h-full w-full"
            role="application"
            aria-label="Border map preview"
          />

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/90">
              <Loader />
            </div>
          )}
          {!loading && error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/95 text-center">
              <AlertTriangleIcon size={24} className="text-red-500" />
              <p className="mt-2 text-xs text-slate-600">
                Unable to load map data.
              </p>
              <Button variant="ghost" size="sm" className="mt-1" onClick={load}>
                Retry
              </Button>
            </div>
          )}
          {!loading && !error && !hasMappedData && !location && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/95 px-5 text-center">
              <MapPinIcon size={24} className="text-slate-300" />

              <p className="mt-2 text-xs font-semibold text-white">
                No mapped cameras or zones available.
              </p>

              {(data.cameras.length > 0 || data.alerts.length > 0) && (
                <p className="mt-1 text-[11px] text-slate-300">
                  {data.cameras.length} cameras and {data.alerts.length} active
                  alerts loaded without geographic coordinates.
                </p>
              )}

              <p className="mt-1 text-[11px] text-slate-300">
                Open the full map to show your location.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default BorderMapPreview;
