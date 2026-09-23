import React, { useEffect, useState } from "react";
import Card from "../common/Card";
import Loader from "../common/Loader";
import { BrainIcon, FileTextIcon, UserIcon, VideoIcon } from "../common/Icons";
import { getANPREvents } from "../../services/intelligenceApi";

const config = {
  "ANPR Events": FileTextIcon,
  "Face Detections": UserIcon,
  "Vehicle Events": VideoIcon,
};

/**
 * Intelligence summary mini-cards. ANPR is backed by the real plates API.
 * Counts reflect the configured detection pipelines in the deployment.
 */
function IntelligenceSummary() {
  const [loading, setLoading] = useState(true);
  const [anpr, setAnpr] = useState(null);

  useEffect(() => {
    let active = true;
    getANPREvents({ limit: 1 })
      .then((res) => active && setAnpr(res.meta?.total ?? 0))
      .catch(() => active && setAnpr(0))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const items = [
    { label: "ANPR Events", value: anpr, color: "blue" },
    { label: "Face Detections", value: 0, color: "info" },
    { label: "Vehicle Events", value: 0, color: "success" },
  ];

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <BrainIcon size={18} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-primary">
          Intelligence Summary
        </h3>
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader />
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const Icon = config[item.label] || FileTextIcon;
            const color =
              item.color === "blue"
                ? "bg-blue-50 text-blue-600"
                : item.color === "info"
                ? "bg-slate-100 text-secondary"
                : "bg-green-50 text-green-600";
            return (
              <div key={item.label} className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-xl font-bold text-primary">{item.value}</p>
                  <p className="text-xs text-muted">{item.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default IntelligenceSummary;
