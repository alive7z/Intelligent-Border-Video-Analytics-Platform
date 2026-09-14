import React, { useEffect, useState } from "react";
import EvidenceGallery from "../common/EvidenceGallery";
import { getAlertEvidence } from "../../services/eventApi";

export default function AlertEvidence({ alert, items }) {
  const [stored, setStored] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (items) return;
    let active = true;
    setStored([]);
    setUnavailable(false);
    getAlertEvidence(alert.id).then((res) => active && setStored(res.data || []))
      .catch(() => active && setUnavailable(true));
    return () => { active = false; };
  }, [alert.id, items]);
  return <EvidenceGallery items={items || stored} unavailable={unavailable} showVehicleStatus={alert.objectType?.toLowerCase() === "vehicle"} />;
}
