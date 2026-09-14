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
    <div className="inline-flex w-full flex-wrap gap-1 rounded-xl border border-cyan-400/40 bg-slate-900/80 p-1 sm:w-auto">
      {tabs.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            role="tab"
            aria-selected={selected}
            className={`btn-focus inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
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
