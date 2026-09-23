import React from "react";
import { SearchIcon, XIcon } from "../common/Icons";

/**
 * Compact filter bar for the camera grid: search + status/alert/sector selects.
 * Controlled so the parent page owns filter state.
 */
function CameraFilters({ filters, onChange, sectors }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  const selectCls =
    "input-field w-full !py-2.5 pr-8 text-sm sm:w-auto sm:min-w-[150px]";

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_auto_auto_auto_auto] dark:bg-slate-50">
      <div className="relative min-w-0">
        <SearchIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          className="input-field !py-2.5 !pl-9"
          placeholder="Search camera ID or location..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Search cameras"
        />
      </div>

      <select
        className={selectCls}
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All Status</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>

      <select
        className={selectCls}
        value={filters.alert}
        onChange={(e) => set("alert", e.target.value)}
        aria-label="Filter by alert state"
      >
        <option value="all">All Alert</option>
        <option value="active">Alert Active</option>
        <option value="normal">Normal</option>
      </select>

      <select
        className={selectCls}
        value={filters.sector}
        onChange={(e) => set("sector", e.target.value)}
        aria-label="Filter by sector"
      >
        <option value="all">All Sectors</option>
        {sectors.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => onChange({ search: "", status: "all", alert: "all", sector: "all" })}
        className="btn-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:text-white/90 sm:col-span-2 xl:col-span-1"
      >
        <XIcon size={15} /> Reset
      </button>
    </div>
  );
}

export default CameraFilters;
