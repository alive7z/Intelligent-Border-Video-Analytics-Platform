import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Badge from "../common/Badge";
import Button from "../common/Button";
import { mockAlerts } from "../../data/mockData";
import { severityTone, statusTone } from "../../utils/severity";
import { relativeTime } from "../../utils/date";

/**
 * Recent alerts table shown on the dashboard overview.
 */
function RecentAlerts() {
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-800">Recent Alerts</h3>
        <Link
          to="/alerts"
          className="btn-focus text-sm font-medium text-navy-700 hover:text-navy-900"
        >
          View all
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Alert ID</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Camera</th>
              <th className="px-5 py-3">Zone</th>
              <th className="px-5 py-3">Severity</th>
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {mockAlerts.slice(0, 6).map((a) => (
              <tr
                key={a.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-5 py-3 font-medium text-navy-700">{a.id}</td>
                <td className="px-5 py-3 text-slate-700">{a.type}</td>
                <td className="px-5 py-3 text-slate-600">{a.camera}</td>
                <td className="px-5 py-3 text-slate-600">{a.zone}</td>
                <td className="px-5 py-3">
                  <Badge tone={severityTone[a.severity]} dot>
                    {a.severity.toUpperCase()}
                  </Badge>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                  {relativeTime(a.time)}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={statusTone[a.status.toLowerCase()] || "default"}>
                    {a.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-right">
                  <Button as={Link} to={`/alerts`} variant="secondary" size="sm">
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default RecentAlerts;
