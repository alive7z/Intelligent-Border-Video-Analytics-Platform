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

/**
 * Horizontal bar chart of alert counts per camera.
 */
function AlertsByCameraChart({ data = [] }) {
  return (
    <ChartCard title="Alerts by Camera" subtitle="Active alerts attributed to each camera">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 10, bottom: 0, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#ffffff" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={70}
              tick={{ fontSize: 12, fill: "#ffffff" }}
              axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.12)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(15,23,42,0.95)",
              }}
              labelStyle={{ color: "#ffffff" }}
              itemStyle={{ color: "#ffffff" }}
              formatter={(value) => [`${value} alerts`, "Alerts"]}
            />
            <Bar dataKey="alerts" fill="#2563eb" radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default AlertsByCameraChart;
