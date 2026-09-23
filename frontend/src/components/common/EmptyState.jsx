import React from "react";

/**
 * Consistent empty / error state: neutral icon, title, optional description
 * and optional action. No large illustrations.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  className = "",
}) {
  const iconTone =
    tone === "error"
      ? "text-red-500 bg-red-50 dark:bg-red-500/15"
      : tone === "warning"
      ? "text-orange-500 bg-orange-50 dark:bg-orange-500/15"
      : "text-muted bg-slate-100 dark:bg-slate-100";
  return (
    <div
      className={`card flex flex-col items-center justify-center gap-3 p-10 text-center ${className}`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full ${iconTone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-primary text-sm font-semibold">{title}</p>
        {description && (
          <p className="text-muted mt-1 text-sm">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export default EmptyState;
