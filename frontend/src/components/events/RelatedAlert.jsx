import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Button from "../common/Button";
import AlertSeverityBadge from "../alerts/AlertSeverityBadge";
import AlertStatusBadge from "../alerts/AlertStatusBadge";
import { AlertTriangleIcon } from "../common/Icons";

/**
 * Links the event to the alert it generated (if any). Alert actions are kept
 * on the Alerts page; here we only surface the relationship.
 */
function RelatedAlert({ event, alert }) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangleIcon size={18} className="text-navy-700" />
        <h3 className="text-sm font-semibold text-slate-800">Related Alert</h3>
      </div>
      {event.relatedAlertId ? (
        <div>
          <Link
            to={`/alerts/${event.relatedAlertId}`}
            className="text-lg font-bold text-navy-700 hover:underline"
          >
            {event.relatedAlertId}
          </Link>
          <div className="mt-2 space-y-3">
            {alert ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Severity:</span>
                  <AlertSeverityBadge severity={alert.severity} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Status:</span>
                  <AlertStatusBadge status={alert.status} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Alert {event.relatedAlertId} — details on the Alerts page.
              </p>
            )}
            <Button as={Link} to={`/alerts/${event.relatedAlertId}`} variant="secondary" size="sm">
              View Alert
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No alert generated for this event.
        </p>
      )}
    </Card>
  );
}

export default RelatedAlert;
