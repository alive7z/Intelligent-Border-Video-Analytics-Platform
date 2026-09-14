import React from "react";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "operators", label: "Operators" },
  { id: "cameras", label: "Cameras" },
  { id: "zones", label: "Zones" },
  { id: "rules", label: "Risk Rules" },
  { id: "retention", label: "Retention & Storage" },
  { id: "health", label: "System Health" },
  { id: "audit", label: "Audit Logs" },
];

/**
 * Secondary navigation for the Admin area.
 * Keyboard-accessible tab list.
 */
function AdminTabs({ active, onChange, readOnly }) {
  return (
    <div
      role="tablist"
      aria-label="Administration sections"
      className="mb-6 inline-flex w-full flex-wrap gap-1 rounded-xl border border-cyan-400/40 bg-slate-900/80 p-1 sm:w-auto"
    >
      {TABS.map((tab) => {
        const selected = active === tab.id;
        const showReadOnly =
          readOnly &&
          ["cameras", "operators", "retention"].includes(tab.id);

        return (
          <button
            key={tab.id}
            role="tab"
            id={`admin-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`admin-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`btn-focus inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {tab.label}

            {showReadOnly && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  selected
                    ? "bg-slate-900/10 text-slate-700"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                View Only
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default AdminTabs;
