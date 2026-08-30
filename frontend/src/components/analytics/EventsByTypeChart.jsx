import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import ChartCard from "./ChartCard";
import { useChartTheme } from "../../hooks/useChartTheme";

/**
 * Vertical bar chart of event counts by detection type.
 */
function EventsByTypeChart({ data = [] }) {
  const chart = useChartTheme();
  return (
    <ChartCard title="Events by Type" subtitle="Detection events by category">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: chart.tick }}
              axisLine={{ stroke: chart.axis }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: chart.tick }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: chart.isDark ? "rgba(148,163,184,0.12)" : "rgba(15,42,79,0.05)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${chart.tooltipBorder}`,
                background: chart.tooltipBg,
              }}
              labelStyle={{ color: chart.tooltipText }}
              itemStyle={{ color: chart.tooltipText }}
            />
            <Bar dataKey="value" name="Events" fill={chart.isDark ? "#4f8fef" : "#0f2a4f"} radius={[4, 4, 0, 0]} maxBarSize={42} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default EventsByTypeChart;
