import React from "react";

const toneClasses = {
  critical:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",

  danger:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",

  high: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/40",

  medium:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40",

  low: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/40",

  info: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/40",

  success:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/40",

  warning:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40",

  online:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/40",

  offline:
    "bg-slate-100 text-secondary border-slate-200 dark:bg-white/10 dark:border-white/15",

  new: "bg-sky-500 text-white border-sky-600 dark:bg-sky-500 dark:text-white dark:border-sky-600",

  active:
    "bg-green-700 text-white border-green-800 dark:bg-green-700 dark:text-white dark:border-green-800",

  acknowledged:
    "bg-blue-600 text-white border-blue-700 dark:bg-blue-600 dark:text-white dark:border-blue-700",

  investigating:
    "bg-orange-500 text-white border-orange-600 dark:bg-orange-500 dark:text-white dark:border-orange-600",

  falsePositive:
    "bg-red-500 text-white border-red-600 dark:bg-red-500 dark:text-white dark:border-red-600",

  resolved:
    "bg-green-500 text-white border-green-600 dark:bg-green-500 dark:text-white dark:border-green-600",

  default:
    "bg-slate-100 text-secondary border-slate-200 dark:bg-white/10 dark:border-white/15",
};

/**
 * Pill-shaped status / severity badge. Severity uses text + color so it is
 * not communicated by color alone (accessibility requirement).
 */
function Badge({ tone = "default", children, className = "", dot = false }) {
  const cls = toneClasses[tone] || toneClasses.default;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${cls} ${className}`}
    >
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
