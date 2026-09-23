import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import EventTypeBadge from "../components/events/EventTypeBadge";
import AlertSeverityBadge from "../components/alerts/AlertSeverityBadge";
import AlertStatusBadge from "../components/alerts/AlertStatusBadge";
import EventDetailsCard from "../components/events/EventDetailsCard";
import EventEvidence from "../components/events/EventEvidence";
import EventTimeline from "../components/events/EventTimeline";
import EventRiskContext from "../components/events/EventRiskContext";
import ObjectInformation from "../components/events/ObjectInformation";
import RelatedAlert from "../components/events/RelatedAlert";
import RelatedEvents from "../components/events/RelatedEvents";
import CameraLink from "../components/events/CameraLink";
import { ArrowLeftIcon, AlertTriangleIcon, ShieldIcon } from "../components/common/Icons";
import { getEventById, getRelatedEvents, getEventEvidence, protectEvent, unprotectEvent } from "../services/eventApi";
import { getAlertById } from "../services/alertApi";
import { getCameraById } from "../services/cameraApi";
import { formatDateTime } from "../utils/date";
import { formatEventLabel } from "../utils/eventTypeLabels";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { useToast } from "../components/common/Toast";
import { SOCKET_EVENTS } from "../services/websocket";

function EventDetails() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const push = useToast();
  const [event, setEvent] = useState(null);
  const [alert, setAlert] = useState(null);
  const [camera, setCamera] = useState(null);
  const [related, setRelated] = useState([]);
  const [relatedUnavailable, setRelatedUnavailable] = useState(false);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [protecting, setProtecting] = useState(false);
  const { subscribe } = useRealtime();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setAlert(null);
    setCamera(null);
    setRelated([]);
    setRelatedUnavailable(false);
    setEvidence([]);
    getEventById(eventId)
      .then((res) => {
        if (!active) return;
        const ev = res.data;
        setEvent(ev);
        if (!ev) return;

        const jobs = [getRelatedEvents(ev.id).then((r) => active && setRelated(r.data || [])).catch(() => active && setRelatedUnavailable(true))];
        jobs.push(
          getEventEvidence(ev.id)
            .then((r) => active && setEvidence(r.data || []))
            .catch(() => active && setEvidence([]))
        );
        if (ev.relatedAlertId) {
          jobs.push(
            getAlertById(ev.relatedAlertId)
              .then((r) => active && setAlert(r.data))
              .catch(() => active && setAlert(null))
          );
        }
        if (ev.cameraId) {
          jobs.push(
            getCameraById(ev.cameraId)
              .then((c) => active && setCamera(c.data))
              .catch(() => active && setCamera(null))
          );
        }
        return Promise.all(jobs).catch(() => {
          if (active) setError(true);
        });
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => subscribe(SOCKET_EVENTS.EVENT_UPDATED, (payload) => {
    const update = payload?.data;
    if (update?.eventCode !== eventId) return;
    if (update.deletedAt) {
      navigate("/events", { replace: true });
      return;
    }
    // Incident risk and ANPR enrich the same event row. Refetch its authoritative
    // context so vehicle number, factors, evidence timeline and score update
    // while the operator has this detail page open.
    getEventById(eventId)
      .then((res) => setEvent(res.data))
      .catch(() => setEvent((current) => current ? {
        ...current,
        isProtected: Boolean(update.isProtected),
      } : current));
    getEventEvidence(eventId).then((res) => setEvidence(res.data || [])).catch(() => {});
  }), [subscribe, eventId, navigate]);

  const toggleProtection = async () => {
    setProtecting(true);
    try {
      const res = event.isProtected ? await unprotectEvent(event.id) : await protectEvent(event.id);
      setEvent(res.data);
      push(event.isProtected ? "Event protection removed." : "Event protected from cleanup.", "success");
    } catch (err) {
      push(err?.message || "Unable to update event protection.", "error");
    } finally {
      setProtecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader label="Loading event..." />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <AlertTriangleIcon size={28} className="text-disabled" />
        {error ? (
          <p className="text-sm font-medium text-secondary">
            Unable to load event details.
          </p>
        ) : (
          <p className="text-sm font-medium text-secondary">
            Event {eventId} not found.
          </p>
        )}
        <Button as={Link} to="/events" variant="secondary" size="sm">
          Back to Events
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/events"
        className="btn-focus inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        <ArrowLeftIcon size={16} /> Back to Events
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary">
            Event {event.id}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-medium text-secondary">{formatEventLabel(event.type)}</span>
            <span>·</span>
            <AlertSeverityBadge severity={event.severity} />
            <span>·</span>
            <AlertStatusBadge status={event.status} />
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatDateTime(event.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {event.relatedAlertId && (
            <EventTypeBadge withIcon={false} label={`Linked to ${event.relatedAlertId}`} />
          )}
          {user?.roleKey === "ADMINISTRATOR" && (
            <Button variant={event.isProtected ? "secondary" : "success"} size="sm" loading={protecting} onClick={toggleProtection}>
              <ShieldIcon size={15} /> {event.isProtected ? "Unprotect" : "Protect"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <EventEvidence event={event} items={evidence} />
        </div>
        <div className="space-y-6">
          <EventDetailsCard event={event} />
          <ObjectInformation event={event} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <EventTimeline event={event} />
        </div>
        <div className="space-y-6">
          <EventRiskContext event={event} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <RelatedAlert event={event} alert={alert} />
        <CameraLink camera={camera} event={event} />
      </div>

      <div className="mt-6">
        <RelatedEvents events={related} unavailable={relatedUnavailable} />
      </div>
    </div>
  );
}

export default EventDetails;
