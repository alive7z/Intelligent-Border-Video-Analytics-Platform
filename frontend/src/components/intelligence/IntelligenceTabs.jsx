import React from "react";

const tabs = [
  { id: "anpr", label: "ANPR" },
  { id: "face", label: "Face Events" },
  { id: "vehicle", label: "Vehicle Intelligence" },
];

/**
 * Clean tab row for switching intelligence views.
 */
function IntelligenceTabs({ active, onChange }) {
  return (
    <div className="inline-flex w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto dark:bg-slate-50">
      {tabs.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            role="tab"
            aria-selected={selected}
            className={`btn-focus inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              selected
                ? "bg-blue-600 text-white shadow-sm"
                : "text-muted hover:bg-slate-100 hover:text-slate-800 dark:hover:text-white/90"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default IntelligenceTabs;
