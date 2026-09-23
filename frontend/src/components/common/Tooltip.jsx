import React from "react";

/**
 * Lightweight accessible tooltip wrapper. Renders a small floating label on
 * hover/focus. Respects reduced motion via CSS.
 */
function Tooltip({ label, children, side = "bottom", className }) {
  const pos =
    side === "bottom"
      ? "top-full mt-1.5 left-1/2 -translate-x-1/2"
      : "left-full ml-2 top-1/2 -translate-y-1/2";
  return (
    <span className={`tooltip-trigger group/tip relative ${className || "inline-flex"}`}>
      {children}
      <span
        role="tooltip"
        className={`tooltip-bubble popup-surface pointer-events-none absolute z-50 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium text-secondary opacity-0 shadow-card transition-opacity duration-150 group-hover/tip:opacity-100 ${pos}`}
      >
        {label}
      </span>
    </span>
  );
}

export default Tooltip;
