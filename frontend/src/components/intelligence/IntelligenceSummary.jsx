import React from "react";

function Card({ label, value }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

/**
 * Top summary row for the intelligence workspace.
 */
function IntelligenceSummary({ summary }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card label="ANPR Events Today" value={summary.anprToday} />
      <Card label="Face Detections" value={summary.faceDetections} />
      <Card label="Vehicle Events" value={summary.vehicleEvents} />
      <Card label="Active Cameras" value={summary.activeCameras} />
    </div>
  );
}

export default IntelligenceSummary;
