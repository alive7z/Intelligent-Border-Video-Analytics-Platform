import React from "react";
import Button from "../common/Button";
import { RefreshIcon, MaximizeIcon, MinimizeIcon, XIcon } from "../common/Icons";

/**
 * Map overlay controls: refresh + full screen toggle.
 */
function MapControls({ onRefresh, fullscreen, onToggleFullscreen }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onRefresh} aria-label="Refresh map">
        <RefreshIcon size={15} /> Refresh
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onToggleFullscreen}
        aria-label={fullscreen ? "Exit full screen" : "Full screen map"}
      >
        {fullscreen ? <MinimizeIcon size={15} /> : <MaximizeIcon size={15} />}
        {fullscreen ? "Exit Full Screen" : "Full Screen"}
      </Button>
    </div>
  );
}

export default MapControls;
