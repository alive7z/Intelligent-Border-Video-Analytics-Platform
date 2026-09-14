import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import ChartCard from "./ChartCard";

const SERIES = {
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#22c55e",
};

/**
 * Multi-line alert trend over the last 7 days, broken down by severity.
 */
function AlertTrendChart({ alertTrend }) {
  const days = alertTrend?.days || [];
  const series = alertTrend?.series || {};
  const data = days.map((day, i) => {
    const row = { day };
    Object.keys(SERIES).forEach((k) => {
      row[k] = (series[k] || [])[i] ?? 0;
    });
    return row;
  });

  return (
    <ChartCard title="Alert Trend" subtitle="Alerts by severity over the last 7 days">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: "#ffffff" }}
              axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#ffffff" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(15,23,42,0.95)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              }}
              labelStyle={{ color: "#ffffff" }}
              itemStyle={{ color: "#ffffff" }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#ffffff" }} />
            {Object.entries(SERIES).map(([k, color]) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export default AlertTrendChart;
