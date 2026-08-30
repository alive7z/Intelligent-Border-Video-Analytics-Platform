import React from "react";
import { Link } from "react-router-dom";
import EventTypeBadge from "./EventTypeBadge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import AlertStatusBadge from "../alerts/AlertStatusBadge";
import RiskScoreBar from "../alerts/RiskScoreBar";
import { formatTime } from "../../utils/date";

/**
 * Single row in the events history table.
 */
function EventRow({ event }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-5 py-3">
        <Link
          to={`/events/${event.id}`}
          className="font-medium text-navy-700 hover:underline"
        >
          {event.id}
        </Link>
      </td>
      <td className="px-5 py-3">
        <EventTypeBadge type={event.type} label={event.type} />
      </td>
      <td className="px-5 py-3 text-slate-600">
        <span className="font-medium text-slate-700">{event.camera}</span>
      </td>
      <td className="px-5 py-3 text-slate-600">
        {event.objectType}
        {event.trackId ? (
          <span className="font-medium text-slate-700"> #{event.trackId.split("-").pop()}</span>
        ) : null}
      </td>
      <td className="px-5 py-3">
        <AlertSeverityBadge severity={event.severity} />
      </td>
      <td className="px-5 py-3">
        <RiskScoreBar score={event.riskScore} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
        {formatTime(event.timestamp)}
      </td>
      <td className="px-5 py-3">
        <AlertStatusBadge status={event.status} />
      </td>
      <td className="px-5 py-3 text-right">
        <Link
          to={`/events/${event.id}`}
          className="btn-focus inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

export default EventRow;
