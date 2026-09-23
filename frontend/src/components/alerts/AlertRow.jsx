import React from "react";
import { Link } from "react-router-dom";
import AlertSeverityBadge from "./AlertSeverityBadge";
import AlertStatusBadge from "./AlertStatusBadge";
import RiskScoreBar from "./RiskScoreBar";
import Button from "../common/Button";
import AcknowledgeAlertButton from "./AcknowledgeAlertButton";
import { BookmarkIcon, TrashIcon } from "../common/Icons";
import { formatDateTime, formatTime } from "../../utils/date";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Single row in the alerts table. Whole row is clickable and also has a
 * focused View link for keyboard users.
 */
function AlertRow({ alert, canDelete = false, showSave = false, savingId = null, onDelete, onAlertAcknowledged, onToggleSaved }) {
  const severityAccent = {
    critical: "border-l-red-600",
    high: "border-l-orange-500",
    medium: "border-l-amber-500",
    low: "border-l-blue-400",
    info: "border-l-slate-300",
  }[String(alert.severity || "info").toLowerCase()];
  return (
    <tr className={`border-b border-l-2 border-b-slate-100 last:border-b-0 hover:bg-slate-50 ${severityAccent}`}>
      <td className="px-5 py-3">
        <AlertSeverityBadge severity={alert.severity} />
      </td>
      <td className="px-5 py-3">
        <Link
          to={`/alerts/${alert.id}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {alert.id}
        </Link>
        {alert.isSaved && (
          <p className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            <BookmarkIcon size={11} filled /> Saved
          </p>
        )}
      </td>
      <td className="px-5 py-3 text-secondary">{formatEventLabel(alert.eventType)}
        {alert.reasons?.[0] && <p className="mt-1 text-xs text-muted">{alert.reasons.slice(0, 2).map((reason) => reason.label).join(" · ")}</p>}
        {alert.vehiclePlate && (
          <p className="mt-1 inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-secondary">
            {alert.vehiclePlate}
          </p>
        )}
      </td>
      <td className="px-5 py-3 text-secondary">{alert.camera}</td>
      <td className="px-5 py-3 text-secondary">{alert.cameraName}</td>
      <td className="px-5 py-3">
        <RiskScoreBar score={alert.riskScore} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-muted">
        {formatTime(alert.timestamp)}
      </td>
      <td className="px-5 py-3">
        <AlertStatusBadge status={alert.status} />
        {alert.acknowledgedBy && (
          <p className="mt-1 max-w-44 text-xs text-muted">
            {alert.acknowledgedBy} · {formatDateTime(alert.acknowledgedAt)}
          </p>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <AcknowledgeAlertButton
            alert={alert}
            onAcknowledged={onAlertAcknowledged}
          />
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onDelete(alert)}
              aria-label={`Delete alert ${alert.id}`}
            >
              <TrashIcon size={14} />
            </Button>
          )}
          <Link
            to={`/alerts/${alert.id}`}
            className="btn-focus inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-slate-50 dark:bg-slate-100"
          >
            View
          </Link>
          {showSave && (
            <Button
              variant={alert.isSaved ? "success" : "secondary"}
              size="sm"
              loading={alert.id === savingId}
              disabled={savingId !== null && alert.id !== savingId}
              onClick={() => onToggleSaved(alert)}
              aria-label={alert.isSaved ? `Remove alert ${alert.id} from Saved Alerts` : `Save alert ${alert.id}`}
            >
              <BookmarkIcon size={14} filled={Boolean(alert.isSaved)} />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default AlertRow;
