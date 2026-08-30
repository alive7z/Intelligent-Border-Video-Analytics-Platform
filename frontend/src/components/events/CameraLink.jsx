import React from "react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Badge from "../common/Badge";
import Button from "../common/Button";
import { CameraIcon } from "../common/Icons";

/**
 * Compact camera reference with a live-camera link. If no camera detail is
 * available we show a generic "Online" indicator.
 */
function CameraLink({ camera, event }) {
  const name =
    (camera && camera.name) || event?.cameraName || "—";
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <CameraIcon size={18} className="text-navy-700" />
        <h3 className="text-sm font-semibold text-slate-800">Camera</h3>
      </div>
      <p className="text-base font-bold text-navy-700">{event?.cameraId || event?.camera}</p>
      <p className="text-sm text-slate-500">{name}</p>
      <div className="mt-2">
        <Badge tone={camera ? (camera.status === "Online" ? "online" : "offline") : "online"}>
          {camera ? camera.status : "Online"}
        </Badge>
      </div>
      <Button
        as={Link}
        to={`/surveillance/${event?.cameraId || event?.camera}`}
        variant="secondary"
        size="sm"
        className="mt-4"
      >
        View Live Camera
      </Button>
    </Card>
  );
}

export default CameraLink;
