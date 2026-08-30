import React from "react";
import { SearchIcon } from "../common/Icons";

const eventTypeOptions = [
  "Person Detection",
  "Vehicle Detection",
  "ANPR Detection",
  "Face Detection",
  "Night Movement",
  "Loitering",
  "Restricted Zone Intrusion",
  "Virtual Fence Crossing",
  "Vehicle in Restricted Zone",
  "Suspicious Activity",
];

const severityOptions = ["info", "low", "medium", "high", "critical"];
const statusOptions = ["Logged", "Active", "Acknowledged", "Resolved"];
const dateOptions = [
  { value: "all", label: "Any Date" },
  { value: "today", label: "Today" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "custom", label: "Custom Range" },
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Compact filter bar for the events history list.
 */
function EventFilters({ filters, onChange, cameras }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const selectCls = "input-field w-auto !py-2 pr-8 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1 sm:flex-none">
        <SearchIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          className="input-field !pl-9"
          placeholder="Search event ID, camera, object, plate..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
          aria-label="Search events"
        />
      </div>

      <select
        className={selectCls}
        value={filters.type}
        onChange={(e) => set("type", e.target.value)}
        aria-label="Filter by event type"
      >
        <option value="all">All Events</option>
        {eventTypeOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.severity}
        onChange={(e) => set("severity", e.target.value)}
        aria-label="Filter by severity"
      >
        <option value="all">All Severities</option>
        {severityOptions.map((s) => (
          <option key={s} value={s}>
            {cap(s)}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.camera}
        onChange={(e) => set("camera", e.target.value)}
        aria-label="Filter by camera"
      >
        <option value="all">All Cameras</option>
        {cameras.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.status}
        onChange={(e) => set("status", e.target.value)}
        aria-label="Filter by status"
      >
        <option value="all">All Status</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.date}
        onChange={(e) => set("date", e.target.value)}
        aria-label="Filter by date"
      >
        {dateOptions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default EventFilters;
