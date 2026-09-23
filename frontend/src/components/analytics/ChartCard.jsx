import React from "react";
import Card from "../common/Card";

/**
 * Shared card wrapper for analytics charts.
 */
function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <Card className={`flex flex-col p-4 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}

export default ChartCard;
