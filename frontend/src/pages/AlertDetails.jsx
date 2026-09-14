import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import AlertSeverityBadge from "../components/alerts/AlertSeverityBadge";
import AlertStatusBadge from "../components/alerts/AlertStatusBadge";
import AlertInformation from "../components/alerts/AlertInformation";
import AlertEvidence from "../components/alerts/AlertEvidence";
import RiskReasons from "../components/alerts/RiskReasons";
import IncidentTimeline from "../components/alerts/IncidentTimeline";
import OperatorActions from "../components/alerts/OperatorActions";
import RelatedCamera from "../components/alerts/RelatedCamera";
import RelatedEvidence from "../components/alerts/RelatedEvidence";
import RelatedEvents from "../components/alerts/RelatedEvents";
import { ArrowLeftIcon, AlertTriangleIcon } from "../components/common/Icons";
import { getAlertById, getIncidentPackage } from "../services/alertApi";
import { getCameraById } from "../services/cameraApi";
import { formatDateTime } from "../utils/date";
import { useRealtime } from "../context/RealtimeContext";
import { fromSocketAlert } from "../services/alertApi";
import { SOCKET_EVENTS } from "../services/websocket";

function AlertDetails() {
  const { alertId } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [camera, setCamera] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [incident, setIncident] = useState(null);
  const [packageUnavailable, setPackageUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    let fetching = false;
    setIncident(null);
    setPackageUnavailable(false);
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const res = await getIncidentPackage(alertId);
        if (active) { setIncident(res.data); setPackageUnavailable(false); }
      } catch (_) { if (active) setPackageUnavailable(true); }
      finally { fetching = false; }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [alertId, alert?.status, alert?.severity]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    getAlertById(alertId)
      .then((res) => {
        if (!active) return;
        const a = res.data;
        setAlert(a);
        if (a?.camera) {
          return getCameraById(a.camera).then((c) => {
            if (active) setCamera(c.data);
          });
        }
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [alertId]);

  const { subscribe } = useRealtime();

  // Realtime: reflect ack/resolve/update for the visible alert without refresh.
  useEffect(() => {
    let active = true;
    const onAlert = (payload) => {
      const item = fromSocketAlert(payload?.data);
      if (!item?.id || item.id !== alertId) return;
      if (item.deletedAt) {
        navigate("/alerts", { replace: true });
        return;
      }
      // Socket updates omit detailed reasons and lifecycle fields. Refetch the
      // authoritative detail instead of wiping them with adapter defaults.
      getAlertById(alertId).then((res) => active && setAlert(res.data)).catch(() => {});
    };
    const offs = [
      subscribe(SOCKET_EVENTS.ALERT_ACKNOWLEDGED, onAlert),
      subscribe(SOCKET_EVENTS.ALERT_RESOLVED, onAlert),
      subscribe(SOCKET_EVENTS.ALERT_UPDATED, onAlert),
    ];
    return () => { active = false; offs.forEach((off) => off()); };
  }, [subscribe, alertId, navigate]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader label="Loading alert..." />
      </div>
    );
  }

  if (error || !alert) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <AlertTriangleIcon size={28} className="text-slate-300" />
        {error ? (
          <p className="text-sm font-medium text-slate-700">
            Unable to load alert details.
          </p>
        ) : (
          <p className="text-sm font-medium text-slate-700">
            Alert {alertId} not found.
          </p>
        )}
        <Button as={Link} to="/alerts" variant="secondary" size="sm">
          Back to Alerts
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/alerts"
        className="btn-focus inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        <ArrowLeftIcon size={16} /> Back to Alerts
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">
            Alert {alert.id}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{alert.eventType}</span>
            <span>·</span>
            <AlertSeverityBadge severity={alert.severity} />
            <span>·</span>
            <AlertStatusBadge status={alert.status} />
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {formatDateTime(alert.timestamp)}
          </p>
        </div>

        {alert.status.toLowerCase() === "resolved" && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            Resolved as <span className="font-semibold">{alert.resolution?.type}</span>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: evidence + timeline */}
        <div className="space-y-6 xl:col-span-2">
          {packageUnavailable && <p className="text-sm text-amber-700">Incident package could not be loaded; showing available alert details.</p>}
          {incident?.truncated && <p className="text-sm text-amber-700">Incident history is truncated. Use Event History for older records.</p>}
          <AlertEvidence alert={alert} items={incident?.evidence} />
          <IncidentTimeline alert={{ ...alert, timeline: incident?.timeline || alert.timeline }} />
          <RelatedEvents alert={{ ...alert, relatedEvents: incident?.events?.map((event) => ({ id: event.event_code, time: formatDateTime(event.occurred_at), type: event.event_type, severity: event.severity })) || [] }} />
        </div>

        {/* Right: information / risk / actions */}
        <div className="space-y-6">
          <AlertInformation alert={alert} />
          <RiskReasons alert={alert} />
          <OperatorActions
            alert={alert}
            onAlertUpdate={(updated) => {
              if (updated?.deletedAt) navigate("/alerts", { replace: true });
              else setAlert((prev) => ({ ...prev, ...updated }));
            }}
          />
          <RelatedCamera camera={camera} alert={alert} />
          <RelatedEvidence items={incident?.evidence || []} />
        </div>
      </div>
    </div>
  );
}

export default AlertDetails;
