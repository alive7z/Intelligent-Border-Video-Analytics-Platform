import React from "react";
import { Link } from "react-router-dom";
import AlertSeverityBadge from "./AlertSeverityBadge";
import AlertStatusBadge from "./AlertStatusBadge";
import RiskScoreBar from "./RiskScoreBar";
import { formatTime } from "../../utils/date";

/**
 * Single row in the alerts table. Whole row is clickable and also has a
 * focused View link for keyboard users.
 */
function AlertRow({ alert }) {
  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-5 py-3">
        <AlertSeverityBadge severity={alert.severity} />
      </td>
      <td className="px-5 py-3">
        <Link
          to={`/alerts/${alert.id}`}
          className="font-medium text-navy-700 hover:underline"
        >
          {alert.id}
        </Link>
      </td>
      <td className="px-5 py-3 text-slate-700">{alert.eventType}</td>
      <td className="px-5 py-3 text-slate-600">{alert.camera}</td>
      <td className="px-5 py-3 text-slate-600">{alert.cameraName}</td>
      <td className="px-5 py-3">
        <RiskScoreBar score={alert.riskScore} />
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
        {formatTime(alert.timestamp)}
      </td>
      <td className="px-5 py-3">
        <AlertStatusBadge status={alert.status} />
      </td>
      <td className="px-5 py-3 text-right">
        <Link
          to={`/alerts/${alert.id}`}
          className="btn-focus inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

export default AlertRow;
