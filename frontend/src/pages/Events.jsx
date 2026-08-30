import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import EventFilters from "../components/events/EventFilters";
import EventTable from "../components/events/EventTable";
import { FileTextIcon, DownloadIcon, ChevronDownIcon, RefreshIcon, AlertTriangleIcon } from "../components/common/Icons";
import { getEvents } from "../services/eventApi";

const PAGE_SIZE = 20;

const defaultFilters = {
  search: "",
  type: "all",
  severity: "all",
  camera: "all",
  status: "all",
  date: "all",
};

function SummaryCard({ label, value }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    setError(false);
    // Fetch the full history once; filtering and pagination are done
    // client-side for snappy interaction. A real backend would paginate.
    getEvents({ pageSize: 1000 })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setEvents(
          [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        );
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const cameras = useMemo(
    () => [...new Set(events.map((e) => e.camera).filter(Boolean))].sort(),
    [events]
  );

  const summary = useMemo(() => {
    const today = new Date().toDateString();
    const typeContains = (label) =>
      events.filter((e) => (e.type || "").toLowerCase().includes(label)).length;
    return {
      totalToday: events.filter((e) => new Date(e.timestamp).toDateString() === today).length,
      security: events.filter((e) => ["high", "critical"].includes(e.severity)).length,
      anpr: typeContains("anpr") + typeContains("plate"),
      acknowledged: events.filter(
        (e) => (e.status || "").toLowerCase() === "acknowledged"
      ).length,
    };
  }, [events]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return events.filter((e) => {
      if (filters.type !== "all" && e.type !== filters.type) return false;
      if (filters.severity !== "all" && e.severity !== filters.severity) return false;
      if (filters.camera !== "all" && e.camera !== filters.camera) return false;
      if (filters.status !== "all" && (e.status || "").toLowerCase() !== filters.status.toLowerCase()) return false;
      if (filters.date === "today" && new Date(e.timestamp).toDateString() !== new Date().toDateString()) return false;
      if (
        filters.date === "24h" &&
        Date.now() - new Date(e.timestamp).getTime() > 24 * 60 * 60 * 1000
      )
        return false;
      if (
        filters.date === "7d" &&
        Date.now() - new Date(e.timestamp).getTime() > 7 * 24 * 60 * 60 * 1000
      )
        return false;
      if (
        q &&
        !`${e.id} ${e.type} ${e.camera} ${e.cameraName} ${e.objectType} ${e.trackId} ${e.anpr?.plate || ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [events, filters]);

  useEffect(() => setPage(1), [filters]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const total = pageCount;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - safePage) <= 1) nums.push(i);
    }
    const out = [];
    let prev = 0;
    nums.forEach((n) => {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    });
    return out;
  }, [pageCount, safePage]);

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Search and review surveillance events, detections, and security incidents."
      >
        <div className="relative">
          <Button variant="secondary" size="sm" disabled>
            <DownloadIcon size={15} /> Export <ChevronDownIcon size={14} />
          </Button>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshIcon size={15} /> Refresh
        </Button>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Total Events Today" value={summary.totalToday} />
        <SummaryCard label="Security Events" value={summary.security} />
        <SummaryCard label="ANPR Events" value={summary.anpr} />
        <SummaryCard label="Acknowledged Incidents" value={summary.acknowledged} />
      </div>

      {/* Filter bar */}
      <div className="card mt-6 p-4">
        <EventFilters filters={filters} onChange={setFilters} cameras={cameras} />
      </div>

      {/* Event history */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Event History</h2>
          {!loading && !error && (
            <p className="text-sm text-slate-500">
              Showing{" "}
              <span className="font-medium text-slate-700">
                {from}–{to}
              </span>{" "}
              of {filtered.length} events
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader label="Loading events..." />
          </div>
        ) : error ? (
          <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangleIcon size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              Unable to load event history.
            </p>
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        ) : visible.length ? (
          <>
            <EventTable events={visible} />
            {pageCount > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Page {safePage} of {pageCount}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    className="btn-focus rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Previous
                  </button>
                  {pageNumbers.map((n, i) =>
                    n === "…" ? (
                      <span key={`e${i}`} className="px-1 text-xs text-slate-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`btn-focus rounded-lg border px-3 py-1.5 text-xs font-medium ${
                          n === safePage
                            ? "border-navy-700 bg-navy-700 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    className="btn-focus rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
            <FileTextIcon size={28} className="text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No events found</p>
            <p className="text-sm text-slate-500">
              No surveillance events match the selected filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Events;
