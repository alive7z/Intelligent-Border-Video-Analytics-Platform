import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import Badge from "../components/common/Badge";
import Loader from "../components/common/Loader";
import Modal from "../components/common/Modal";
import StatusIndicator from "../components/common/StatusIndicator";
import DetectionOverlay from "../components/surveillance/DetectionOverlay";
import CameraInfoPanel from "../components/surveillance/CameraInfoPanel";
import CurrentDetections from "../components/surveillance/CurrentDetections";
import ContextStatus from "../components/surveillance/ContextStatus";
import CameraEvents from "../components/surveillance/CameraEvents";
import {
  ArrowLeftIcon,
  VideoIcon,
  FileTextIcon,
  PlusIcon,
  BellIcon,
  CheckIcon,
} from "../components/common/Icons";
import {
  getCameraById,
  getCameraEvents,
} from "../services/cameraApi";
import { acknowledgeAlert } from "../services/alertApi";

function CameraDetails() {
  const { cameraId } = useParams();
  const [camera, setCamera] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ackState, setAckState] = useState({ loading: false, done: false });
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setAckState({ loading: false, done: false });
    Promise.all([getCameraById(cameraId), getCameraEvents(cameraId)])
      .then(([c, e]) => {
        if (!active) return;
        setCamera(c.data);
        setEvents(e.data || []);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cameraId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader label="Loading camera..." />
      </div>
    );
  }

  if (error || !camera) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <VideoIcon size={28} className="text-slate-300" />
        {error ? (
          <p className="text-sm font-medium text-slate-700">
            Unable to load camera details.
          </p>
        ) : (
          <p className="text-sm font-medium text-slate-700">
            Camera {cameraId} not found.
          </p>
        )}
        <Button as={Link} to="/surveillance" variant="secondary" size="sm">
          Back to Surveillance
        </Button>
      </div>
    );
  }

  const isOnline = camera.status === "online";
  const hasAlert = Boolean(camera.activeAlert);
  const ackId = camera.activeAlert?.id || null;

  const handleAcknowledge = async () => {
    if (!ackId || ackState.done) return;
    setAckState({ loading: true, done: false });
    try {
      const res = await acknowledgeAlert(ackId, {
        operator: "Security Operator",
        notes: "Acknowledged from camera view.",
      });
      setAckState({ loading: false, done: Boolean(res?.data) });
    } catch (err) {
      setAckState({ loading: false, done: false });
    }
  };

  return (
    <div>
      <Link
        to="/surveillance"
        className="btn-focus inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-navy-900"
      >
        <ArrowLeftIcon size={16} />
        Back to Surveillance
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">
            {camera.id} – {camera.name}
          </h1>
          {isOnline ? (
            <StatusIndicator status="success" label="ONLINE · LIVE" pulse />
          ) : (
            <StatusIndicator status="offline" label="OFFLINE" />
          )}
        </div>
        {hasAlert && isOnline && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={ackState.done}
              loading={ackState.loading}
              onClick={handleAcknowledge}
            >
              <CheckIcon size={14} />{" "}
              {ackState.done ? "Acknowledged" : "Acknowledge Alert"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setInfoModal("evidence")}
            >
              <FileTextIcon size={14} /> View Evidence
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setInfoModal("incident")}
            >
              <PlusIcon size={14} /> Create Incident Report
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Large video panel */}
        <div className="xl:col-span-2">
          <Card pad={false}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <VideoIcon size={16} className="text-navy-700" />
                <span className="font-medium text-slate-800">{camera.id}</span>
                <span className="text-slate-400">·</span>
                <span>{camera.sector || camera.location}</span>
              </div>
              {isOnline && <Badge tone="danger" dot>LIVE</Badge>}
            </div>

            <div className="relative aspect-video bg-slate-900 dark:bg-[#0b101a]">
              {isOnline ? (
                <>
                  <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                      backgroundSize: "32px 32px",
                    }}
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    <VideoIcon size={40} />
                  </div>
                  <DetectionOverlay detections={camera.detections || []} trackId />

                  {/* Zone boundary overlay */}
                  <div
                    className="pointer-events-none absolute inset-x-10 top-8 bottom-10 rounded-lg border border-dashed border-lime-300/40"
                    aria-hidden="true"
                  >
                    <span className="absolute -top-3 left-2 rounded bg-lime-300/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-lime-200">
                      Restricted Zone / Virtual Fence
                    </span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-slate-400 dark:bg-[#141c2b]">
                  <VideoIcon size={40} />
                  <p className="mt-3 text-sm font-semibold uppercase tracking-wide">
                    Camera Offline
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Last Seen {camera.lastSeen || "—"} · Stream Disconnected
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column panels */}
        <div className="space-y-6">
          <CameraInfoPanel camera={camera} />
          <ContextStatus context={camera.context} />
        </div>
      </div>

      {/* Bottom row */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <CurrentDetections detections={camera.detections} />
        </div>
        <div className="xl:col-span-1">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <BellIcon size={18} className="text-navy-700" />
              <h3 className="text-sm font-semibold text-slate-800">
                Current Alert
              </h3>
            </div>
            {hasAlert ? (
              ackState.done ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <Badge tone="acknowledged" dot>
                    ACKNOWLEDGED
                  </Badge>
                  <p className="mt-2 text-sm text-yellow-800">
                    The active alert has been acknowledged by the operator.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <Badge tone="high" dot>
                    {(camera.activeAlert.severity).toUpperCase()} ·{" "}
                    {camera.activeAlert.type}
                  </Badge>
                  <p className="mt-2 text-sm text-red-800">
                    {camera.activeAlert.type} detected on {camera.id}.
                  </p>
                </div>
              )
            ) : (
              <p className="text-sm text-slate-500">No active alert.</p>
            )}
          </Card>
        </div>
        <div className="xl:col-span-1">
          <CameraEvents cameraId={cameraId} events={events} />
        </div>
      </div>

      <Modal
        open={infoModal !== null}
        onClose={() => setInfoModal(null)}
        title={infoModal === "evidence" ? "Evidence" : "Incident Report"}
      >
        <p className="text-sm text-slate-600">
          {infoModal === "evidence"
            ? "Evidence snapshots and incident clips will be available here once the evidence capture service is connected."
            : "Incident report creation will be enabled once the backend case-management service is connected."}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          This is a demonstration build running on mock data.
        </p>
      </Modal>
    </div>
  );
}

export default CameraDetails;
