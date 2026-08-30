import React from "react";
import Card from "../common/Card";
import { BrainIcon, FileTextIcon, UserIcon, VideoIcon } from "../common/Icons";
import { mockIntelligenceSummary } from "../../data/mockData";

const config = {
  "ANPR Events": FileTextIcon,
  "Face Detections": UserIcon,
  "Vehicle Events": VideoIcon,
};

/**
 * Intelligence summary mini-cards. NOTE: no external watchlist/blacklist
 * hits are displayed because no such government database integration exists.
 */
function IntelligenceSummary() {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <BrainIcon size={18} className="text-navy-700" />
        <h3 className="text-sm font-semibold text-slate-800">
          Intelligence Summary
        </h3>
      </div>
      <div className="space-y-4">
        {mockIntelligenceSummary.map((item) => {
          const Icon = config[item.label] || FileTextIcon;
          const color =
            item.color === "navy"
              ? "text-navy-700 bg-navy-50"
              : item.color === "info"
              ? "text-blue-600 bg-blue-50"
              : "text-green-700 bg-green-50";
          return (
            <div key={item.label} className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1">
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default IntelligenceSummary;
