import React from "react";
import { Link } from "react-router-dom";
import EventTypeBadge from "./EventTypeBadge";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import AlertStatusBadge from "../alerts/AlertStatusBadge";
import RiskScoreBar from "../alerts/RiskScoreBar";
import Button from "../common/Button";
import { TrashIcon } from "../common/Icons";
import { formatDateTime } from "../../utils/date";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Single row in the events history table.
 */
function EventRow({ event, canDelete = false, onDelete }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-5 py-3">
        <Link
          to={`/events/${event.id}`}
          className="font-medium text-sky-400 hover:underline"
        >
          {event.id}
        </Link>
      </td>
      <td className="px-5 py-3">
        <EventTypeBadge type={event.type} />
      </td>
      <td className="px-5 py-3 text-slate-600">
        <span className="font-medium text-slate-700">{event.camera}</span>
      </td>
      <td className="px-5 py-3 text-slate-600">
        {formatEventLabel(event.objectType)}
        {event.trackId ? (
          <span className="font-medium text-slate-700"> #{event.trackId.split("-").pop()}</span>
        ) : null}
        {event.context?.vehiclePlate && (
          <span className="ml-2 inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs font-medium tracking-wide text-slate-700">
            {event.context.vehiclePlate}
          </span>
        )}
      </td>
      <td className="px-5 py-3">
        <AlertSeverityBadge severity={event.severity} />
      </td>
      <td className="px-5 py-3">
        <RiskScoreBar score={event.riskScore} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
        {formatDateTime(event.timestamp)}
      </td>
      <td className="px-5 py-3">
        <AlertStatusBadge status={event.status} />
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDelete(event)}
              aria-label={`Delete event ${event.id}`}
            >
              <TrashIcon size={14} />
            </Button>
          )}
          <Link
            to={`/events/${event.id}`}
            className="btn-focus inline-flex items-center rounded-lg border border-green-500 bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 hover:border-green-600"
          >
            View
          </Link>
        </div>
      </td>
    </tr>
  );
}

export default EventRow;
