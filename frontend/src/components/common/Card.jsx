import React from "react";

/**
 * Consistent card wrapper.
 */
function Card({ children, className = "", pad = true, hover = false }) {
  return (
    <div className={`card ${hover ? "card-hover" : ""} ${pad ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Standardized card header: title (with optional leading icon) on the left,
 * optional action(s) on the right.
 */
export function CardHeader({ icon, title, subtitle, children, className = "" }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        {icon &&
          React.cloneElement(icon, {
            className: `${icon.props.className || ""} text-blue-600`.trim(),
          })}
        <div>
          <h3 className="text-primary text-[15px] font-semibold tracking-tight">
            {title}
          </h3>
          {subtitle && <p className="text-muted mt-1 text-xs leading-5">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export default Card;
