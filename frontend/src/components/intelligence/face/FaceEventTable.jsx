import React from "react";
import ConfidenceBadge from "../ConfidenceBadge";
import { EyeIcon } from "../../common/Icons";
import { formatTime } from "../../../utils/date";
import { EvidenceImage } from "../DetailBits";

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
 * Face event table (desktop) + stacked cards (mobile).
 */
function FaceEventTable({ events, onView }) {
  return (
    <>
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Related Event</th>
                <th className="px-5 py-3">Person Track</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Confidence</th>
                <th className="px-5 py-3">Face Snapshot</th>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-blue-700">{f.id}</td>
                  <td className="px-5 py-3 text-secondary">{f.trackId}</td>
                  <td className="px-5 py-3 text-secondary">{f.cameraId}</td>
                  <td className="px-5 py-3 text-secondary">{f.location || "—"}</td>
                  <td className="px-5 py-3">
                    <ConfidenceBadge value={f.confidence} />
                  </td>
                  <td className="px-5 py-3"><EvidenceImage evidenceId={f.evidenceId} compact /></td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">
                    {formatTime(f.timestamp)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ActionButton onClick={() => onView(f)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {events.map((f) => (
          <div key={f.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <EyeIcon size={20} className="text-disabled" />
                <div>
                  <p className="font-semibold text-blue-700">{f.id}</p>
                  <p className="text-sm text-secondary">
                    {f.trackId} · {f.cameraId}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {f.location || "—"} · {formatTime(f.timestamp)}
                  </p>
                </div>
              </div>
              <ConfidenceBadge value={f.confidence} />
            </div>
            <div className="mt-3"><EvidenceImage evidenceId={f.evidenceId} compact /></div>
            <button
              type="button"
              onClick={() => onView(f)}
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

export default FaceEventTable;
