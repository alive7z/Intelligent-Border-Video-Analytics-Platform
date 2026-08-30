import React from "react";

const TABS = [
  { id: "cameras", label: "Cameras" },
  { id: "zones", label: "Zones" },
  { id: "rules", label: "Risk Rules" },
  { id: "users", label: "Users & Roles" },
  { id: "settings", label: "System Settings" },
];

/**
 * Secondary navigation for the Admin area. Keyboard-accessible tab list.
 */
function AdminTabs({ active, onChange, readOnly }) {
  return (
    <div
      role="tablist"
      aria-label="Administration sections"
      className="mb-6 flex flex-wrap gap-1 border-b border-slate-200"
    >
      {TABS.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            id={`admin-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`admin-panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`btn-focus inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium ${
              selected
                ? "border-navy-700 text-navy-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {t.label}
            {readOnly && t.id === "cameras" && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
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
