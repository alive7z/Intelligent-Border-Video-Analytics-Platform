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
          className="font-medium text-blue-600 hover:underline"
        >
          {event.id}
        </Link>
      </td>
      <td className="px-5 py-3">
        <EventTypeBadge type={event.type} />
      </td>
      <td className="px-5 py-3 text-secondary">
        <span className="font-medium text-secondary">{event.camera}</span>
      </td>
      <td className="px-5 py-3 text-secondary">
        {formatEventLabel(event.objectType)}
        {event.trackId ? (
          <span className="font-medium text-secondary"> #{event.trackId.split("-").pop()}</span>
        ) : null}
        {event.context?.vehiclePlate && (
          <span className="ml-2 inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs font-medium tracking-wide text-secondary">
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
      <td className="whitespace-nowrap px-5 py-3 text-muted">
        {formatDateTime(event.timestamp)}
      </td>
      <td className="px-5 py-3">
        <AlertStatusBadge status={event.status} />
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onDelete(event)}
              aria-label={`Delete event ${event.id}`}
            >
              <TrashIcon size={14} />
            </Button>
          )}
          <Link
            to={`/events/${event.id}`}
            className="btn-focus inline-flex items-center rounded-lg border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:border-blue-500 hover:bg-blue-500"
          >
            View
          </Link>
        </div>
      </td>
    </tr>
  );
}

export default EventRow;
