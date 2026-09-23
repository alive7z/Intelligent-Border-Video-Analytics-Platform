import React from "react";
import ConfidenceBadge from "../ConfidenceBadge";
import { formatTime } from "../../../utils/date";
import { formatEventLabel } from "../../../utils/eventTypeLabels";

function ActionButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-focus inline-flex items-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:border-blue-500 hover:bg-blue-500"
    >
      View
    </button>
  );
}

/**
 * Vehicle intelligence table (desktop) + stacked cards (mobile).
 */
function VehicleTable({ events, onView }) {
  return (
    <>
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Track ID</th>
                <th className="px-5 py-3">Vehicle Type</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">Plate</th>
                <th className="px-5 py-3">Detection Confidence</th>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Related Event</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-blue-700">{v.trackId}</td>
                  <td className="px-5 py-3 text-secondary">{formatEventLabel(v.vehicleType)}</td>
                  <td className="px-5 py-3 text-secondary">{v.cameraId}</td>
                  <td className="px-5 py-3 text-secondary">{v.plateNumber || "—"}</td>
                  <td className="px-5 py-3">
                    <ConfidenceBadge value={v.confidence} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">
                    {formatTime(v.timestamp)}
                  </td>
                  <td className="px-5 py-3 text-secondary">{v.relatedEventId || "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <ActionButton onClick={() => onView(v)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {events.map((v) => (
          <div key={v.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-blue-700">{v.trackId}</p>
                <p className="text-sm text-secondary">
                  {formatEventLabel(v.vehicleType)} · {v.cameraId}
                </p>
                <p className="mt-0.5 text-xs text-muted">{formatTime(v.timestamp)}</p>
                <p className="mt-0.5 text-xs text-muted">Plate: {v.plateNumber || "—"}</p>
              </div>
              <ConfidenceBadge value={v.confidence} />
            </div>
            <button
              type="button"
              onClick={() => onView(v)}
              className="btn-focus mt-3 inline-flex w-full items-center justify-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:border-blue-500 hover:bg-blue-500"
            >
              View
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default VehicleTable;
