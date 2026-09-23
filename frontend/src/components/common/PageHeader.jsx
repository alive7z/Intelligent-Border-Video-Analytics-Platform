import React from "react";

/**
 * Consistent page heading with optional actions area.
 * Title on the left, actions on the right.
 */
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="section-label mb-2">Command centre</p>
        <h1 className="text-primary text-[26px] font-semibold leading-tight tracking-tight lg:text-[30px]">
          {title}
        </h1>

        {subtitle && (
          <p className="text-muted mt-1.5 max-w-2xl text-sm leading-6">
            {subtitle}
          </p>
        )}
      </div>

      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

export default PageHeader;
