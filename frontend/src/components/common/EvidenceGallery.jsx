import React, { useEffect, useState } from "react";
import Card from "./Card";
import Button from "./Button";
import Loader from "./Loader";
import { fetchEvidenceFileUrl } from "../../services/eventApi";
import { formatDateTime } from "../../utils/date";
import { formatEventLabel } from "../../utils/eventTypeLabels";
import EvidenceIntegrityPanel from "../integrity/EvidenceIntegrityPanel";

// Authenticated snapshot-oriented evidence, with object URLs released on selection/unmount.
export default function EvidenceGallery({ items = [], title = "Incident Evidence", unavailable = false, emptyMessage = "No snapshot available", showVehicleStatus = false }) {
  const priority = { SNAPSHOT: 0, PLATE: 1, VEHICLE: 2, FACE: 3 };
  const visibleItems = items
    .filter((item) => item?.type !== "INCIDENT_CLIP" && !item?.mimeType?.startsWith("video/"))
    .sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
  const hasSnapshot = visibleItems.some((item) => item.type === "SNAPSHOT" || item.type === "VEHICLE");
  const hasPlate = visibleItems.some((item) => item.type === "PLATE");
  const [selectedId, setSelectedId] = useState(null);
  const selected = visibleItems.find((item) => item.id === selectedId) || visibleItems[0];
  const [asset, setAsset] = useState(null);
  const url = asset?.id === selected?.id ? asset?.url : null;
  const [loading, setLoading] = useState(Boolean(selected));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl;
    setAsset(null);
    setFailed(false);
    setLoading(Boolean(selected));
    if (selected) fetchEvidenceFileUrl(selected.id).then((value) => {
      if (!active) { URL.revokeObjectURL(value); return; }
      objectUrl = value;
      setAsset({ id: selected.id, url: value });
    }).catch(() => active && setFailed(true)).finally(() => active && setLoading(false));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected?.id]);
  return <Card>
    <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-slate-900 p-2 text-center text-sm text-slate-300">
      {loading ? <Loader label="Loading evidence…" /> : url ? (
        <img src={url} alt={`${formatEventLabel(selected.type)} evidence from ${selected.cameraCode || "camera"}`} className="h-full w-full object-contain" />
      ) : <p>{unavailable ? "Evidence metadata could not be loaded." : failed ? "The stored evidence file is unavailable." : emptyMessage}</p>}
    </div>
    {showVehicleStatus && <div className="mt-3 space-y-1 text-xs text-slate-500">
      {!hasSnapshot && <p>No snapshot available</p>}
      {!hasPlate && <p>Plate not confirmed</p>}
    </div>}
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleItems.map((item, index) => <Button key={item.id} size="sm" variant={item.id === selected?.id ? "primary" : "secondary"} onClick={() => setSelectedId(item.id)}>
        {item.type === "SNAPSHOT" ? "BEST SNAPSHOT" : item.type === "PLATE" ? "PLATE CROP" : `${formatEventLabel(item.type)} ${index + 1}`}
      </Button>)}
    </div>
    {selected && <p className="mt-3 break-all text-xs text-slate-500">{selected.id} · {selected.cameraCode} · {formatDateTime(selected.capturedAt)}{selected.type === "FACE" ? " · Face detection only; identity unknown" : ""}</p>}
  </Card>;
}
