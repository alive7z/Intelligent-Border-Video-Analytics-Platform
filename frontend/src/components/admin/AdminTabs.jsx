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
      className="mb-6 flex w-full gap-1 overflow-x-auto border-b border-slate-200 pb-2"
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
            className={`btn-focus relative inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25"
                : "text-muted hover:bg-slate-100 hover:text-slate-800 dark:hover:text-white/90"
            }`}
          >
            {tab.label}

            {showReadOnly && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  selected
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"
                    : "bg-slate-100 text-muted"
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
