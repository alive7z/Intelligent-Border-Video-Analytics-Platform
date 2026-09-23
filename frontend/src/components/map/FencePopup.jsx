import React from "react";
import Badge from "../common/Badge";
import { LayersIcon } from "../common/Icons";
import { formatEventLabel } from "../../utils/eventTypeLabels";

/**
 * Virtual fence popup.
 */
function FencePopup({ fence }) {
  return (
    <div className="min-w-[220px]">
      <div className="flex items-center gap-2">
        <LayersIcon size={15} className="text-blue-700" />
        <p className="text-sm font-bold text-primary">{fence.id}</p>
      </div>
      <p className="text-sm text-secondary">{fence.name}</p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted">Camera:</span>
          <span className="font-medium text-secondary">{fence.cameraId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Rule:</span>
          <span className="text-secondary">{fence.rule}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Status:</span>
          <Badge tone="online">{formatEventLabel(fence.status)}</Badge>
        </div>
      </div>
    </div>
  );
}

export default FencePopup;
