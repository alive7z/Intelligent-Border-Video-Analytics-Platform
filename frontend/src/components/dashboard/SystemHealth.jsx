import React from "react";
import Card from "../common/Card";
import { ActivityIcon } from "../common/Icons";
import { mockSystemHealth } from "../../data/mockData";

const toneMap = (status) => {
  switch (status) {
    case "Healthy":
    case "Online":
    case "Connected":
      return { dot: "bg-success", text: "text-success" };
    case "Warning":
      return { dot: "bg-warning", text: "text-warning" };
    case "Offline":
      return { dot: "bg-danger", text: "text-danger" };
    default:
      return { dot: "bg-slate-400", text: "text-slate-500" };
  }
};

/**
 * Compact system health panel.
 */
function SystemHealth() {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <ActivityIcon size={18} className="text-navy-700" />
        <h3 className="text-sm font-semibold text-slate-800">System Health</h3>
      </div>
      <ul className="space-y-3">
        {mockSystemHealth.map((s) => {
          const tone = toneMap(s.status);
          return (
            <li
              key={s.name}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
                  aria-hidden="true"
                />
                <span className="truncate text-sm text-slate-700">{s.name}</span>
              </span>
              <span className="text-right">
                <span className={`block text-sm font-medium ${tone.text}`}>
                  {s.status}
                </span>
                <span className="block text-xs text-slate-400">{s.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default SystemHealth;
