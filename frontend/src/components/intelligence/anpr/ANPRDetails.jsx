import React, { useEffect, useState } from "react";
import ConfidenceBadge, { ocrQuality, confidencePercent } from "../ConfidenceBadge";
import { DetailRow, Snapshot, CameraButton, EventButton } from "../DetailBits";
import { getEvidenceBlob, getEventEvidence } from "../../../services/intelligenceApi";
import { formatDateTime } from "../../../utils/date";

function useEventEvidence(eventId) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setItems([]);
    if (!eventId) return undefined;
    let active = true;
    if (eventId) {
      getEventEvidence(eventId)
        .then((res) => active && setItems(res.data || []))
        .catch(() => active && setItems([]));
    }
    return () => {
      active = false;
    };
  }, [eventId]);
  return items;
}

function AnprEvidenceImage({ evidenceId, label, sublabel }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setSrc(null);
    setFailed(false);
    if (!evidenceId) return undefined;
    getEvidenceBlob(evidenceId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceId]);

  if (!evidenceId || failed) return <Snapshot label={label} sublabel={sublabel} />;
  if (!src)
    return <span className="text-xs text-slate-400">Loading {label.toLowerCase()}…</span>;
  return (
    <img
      src={src}
      alt={label}
      className="max-h-64 w-full rounded-lg bg-slate-950 object-contain"
    />
  );
}

function ANPRDetails({ event, eventType }) {
  const pct = confidencePercent(event.confidence);
  const low = ocrQuality(pct) === "low";
  const evidence = useEventEvidence(event.relatedEventId);
  const plateEvidence = evidence.find((item) => item.evidence_type === "PLATE") || null;
  const vehicleEvidence = evidence.find((item) => item.evidence_type === "VEHICLE") || null;

  return (
    <div>
      <dl className="divide-y divide-slate-100 text-sm">
        <DetailRow label="Plate Number" value={event.plateNumber} />
        <DetailRow label="OCR Confidence" value={<ConfidenceBadge value={event.confidence} />} />
        <DetailRow label="Raw OCR Text" value={event.rawText} />
        <DetailRow label="Vehicle Type" value={event.vehicleType || "—"} />
        <DetailRow label="Vehicle Track ID" value={event.vehicleTrackId} />
        <DetailRow label="Camera" value={[event.cameraId, event.cameraName].filter(Boolean).join(" · ")} />
        <DetailRow label="Location" value={event.location} />
        <DetailRow label="Timestamp" value={formatDateTime(event.timestamp)} />
      </dl>

      {low && (
        <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          OCR confidence is below the 75% UI medium band. This record still reflects only the validator-confirmed OCR result.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Vehicle Snapshot
          </p>
          <AnprEvidenceImage
            evidenceId={vehicleEvidence?.evidence_code}
            label="Vehicle Snapshot"
            sublabel={`${event.cameraId} · ${event.cameraName}`}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Plate Crop
          </p>
          <AnprEvidenceImage
            evidenceId={plateEvidence?.evidence_code}
            label="Plate Crop"
            sublabel={event.plateNumber}
          />
        </div>
      </div>

      <div className="mt-4">
        <CameraButton cameraId={event.cameraId} />
      </div>
      {event.relatedEventId && (
        <EventButton eventId={event.relatedEventId} eventType={eventType} />
      )}
    </div>
  );
}

export default ANPRDetails;