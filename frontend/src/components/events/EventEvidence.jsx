import React from "react";
import EvidenceGallery from "../common/EvidenceGallery";

export default function EventEvidence({ event, items }) {
  return <EvidenceGallery title="Event Evidence" items={items || []} showVehicleStatus={event?.objectType?.toLowerCase() === "vehicle"} />;
}
